import Fastify from "fastify";
import cors from "@fastify/cors";
import { ethers, Wallet } from "ethers";
import { prisma } from "@kite-stack/db";
import {
  DefaultSignatureVerifier,
  createRouteEnforcer,
  enforcementErrorHandler,
  getRoutePolicies,
} from "@kite-stack/provider-kit";
import { loadConfig } from "./config.js";
import {
  OnchainPassportClient,
  OnchainReceiptWriter,
  OnchainSessionClient,
  createContractClients,
} from "./contracts.js";
import { KitePaymentService } from "./payment.js";
import { proxyWeatherRequest } from "./upstream/weatherProxy.js";
import {
  InMemoryRateLimiter,
  PrismaBudgetService,
  PrismaEventSink,
  PrismaNonceStore,
  PrismaQuoteStore,
  PrismaReceiptWriter,
} from "./storage.js";
import { registerOperationalRoutes } from "./operationalRoutes.js";

const config = loadConfig();

const clients = createContractClients({
  rpcUrl: config.KITE_RPC_URL,
  signerPrivateKey: config.GATEWAY_SIGNER_PRIVATE_KEY,
  passportRegistryAddress: config.PASSPORT_REGISTRY_ADDRESS,
  sessionRegistryAddress: config.SESSION_REGISTRY_ADDRESS,
  receiptLogAddress: config.RECEIPT_LOG_ADDRESS,
});

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const passportClient = new OnchainPassportClient(clients.passportContract);
const sessionClient = new OnchainSessionClient(clients.sessionContract);
const quoteStore = new PrismaQuoteStore();
const eventSink = new PrismaEventSink();
const paymentService = new KitePaymentService(config.FACILITATOR_URL, clients.provider);
const receiptWriter = new PrismaReceiptWriter(new OnchainReceiptWriter(clients.receiptContract));
const routePolicies = getRoutePolicies(config.ROUTE_POLICY_PROFILE, {
  enrichWalletPriceAtomic: config.TEST_PRICE_ENRICH_ATOMIC,
  premiumIntelPriceAtomic: config.TEST_PRICE_PREMIUM_ATOMIC,
  kiteWeatherProxyPriceAtomic: config.TEST_PRICE_WEATHER_KITE_ATOMIC,
  weatherFallbackProxyPriceAtomic: config.TEST_PRICE_WEATHER_FALLBACK_ATOMIC,
});

const enforcer = createRouteEnforcer({
  routePolicies,
  defaultPayTo: config.PAYMENT_RECIPIENT as `0x${string}`,
  defaultAsset: config.PAYMENT_ASSET as `0x${string}`,
  facilitatorUrl: config.FACILITATOR_URL,
  passportClient,
  sessionClient,
  quoteStore,
  paymentService,
  nonceStore: new PrismaNonceStore(),
  budgetService: new PrismaBudgetService(),
  rateLimiter: new InMemoryRateLimiter(),
  receiptWriter,
  eventSink,
  signatureVerifier: new DefaultSignatureVerifier(),
  routeIdResolver: (request) => {
    const routeConfig = request.routeOptions.config as unknown as Record<string, unknown> | undefined;
    return typeof routeConfig?.routeId === "string" ? routeConfig.routeId : "";
  },
});

app.setErrorHandler((error, request, reply) => {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  void enforcementErrorHandler(normalizedError, request, reply);
});

app.get("/health", async () => ({ ok: true }));

app.post(
  "/api/enrich-wallet",
  { config: { routeId: "api.enrich-wallet" }, preHandler: [enforcer] },
  async (request) => {
    const body = (request.body ?? {}) as { walletAddress?: string; activityHint?: string };
    const walletAddress = (body.walletAddress || Wallet.createRandom().address).toLowerCase();
    const activityHint = body.activityHint || "unknown";

    const entropy = Number(BigInt(ethers.id(`${walletAddress}:${activityHint}`)) % 100n);
    const score = 50 + Math.floor(entropy / 2);

    return {
      actionId: request.enforcementContext?.actionId,
      walletAddress,
      riskScore: score,
      labels: score > 80 ? ["active_trader", "high_velocity"] : ["steady_user"],
      explanation: `Generated deterministic intelligence from wallet ${walletAddress} and activity hint ${activityHint}.`,
    };
  }
);

app.post(
  "/api/premium-intel",
  { config: { routeId: "api.premium-intel" }, preHandler: [enforcer] },
  async (request) => {
    const payload = request.body as Record<string, unknown>;

    if (config.PREMIUM_API_URL && config.PREMIUM_API_KEY) {
      const response = await fetch(config.PREMIUM_API_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.PREMIUM_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload ?? {}),
      });

      if (response.ok) {
        return {
          actionId: request.enforcementContext?.actionId,
          source: "external",
          data: await response.json(),
        };
      }
    }

    return {
      actionId: request.enforcementContext?.actionId,
      source: "mock",
      data: {
        signal: "premium-intel-fallback",
        confidence: 0.78,
        notes: "External provider unavailable; using deterministic fallback.",
      },
    };
  }
);

app.post(
  "/api/weather-kite",
  { config: { routeId: "api.kite-weather-proxy" }, preHandler: [enforcer] },
  async (request, reply) => {
    const body = (request.body ?? {}) as { location?: string };
    const location = String(body.location ?? "").trim();

    if (!location) {
      reply.status(400).send({
        code: "INVALID_REQUEST",
        message: "location is required",
        gatewayActionId: request.enforcementContext?.actionId,
      });
      return;
    }

    try {
      const upstream = await proxyWeatherRequest({
        upstreamUrl: config.WEATHER_UPSTREAM_URL,
        location,
        requestHeaders: request.headers as Record<string, unknown>,
        gatewayActionId: request.enforcementContext?.actionId,
        timeoutMs: config.WEATHER_PROXY_TIMEOUT_MS,
      });

      for (const [key, value] of Object.entries(upstream.responseHeaders)) {
        reply.header(key, value);
      }

      reply.status(upstream.statusCode).send(upstream.payload);
    } catch (error) {
      reply.status(502).send({
        code: "UPSTREAM_UNAVAILABLE",
        message: (error as Error).message,
        gatewayActionId: request.enforcementContext?.actionId,
      });
    }
  }
);

app.post(
  "/api/weather-fallback",
  { config: { routeId: "api.weather-fallback-proxy" }, preHandler: [enforcer] },
  async (request, reply) => {
    const body = (request.body ?? {}) as { location?: string };
    const location = String(body.location ?? "").trim();

    if (!location) {
      reply.status(400).send({
        code: "INVALID_REQUEST",
        message: "location is required",
        gatewayActionId: request.enforcementContext?.actionId,
      });
      return;
    }

    try {
      const upstream = await proxyWeatherRequest({
        upstreamUrl: `${config.WEATHER_FALLBACK_BASE_URL.replace(/\/$/, "")}/api/weather`,
        location,
        requestHeaders: request.headers as Record<string, unknown>,
        gatewayActionId: request.enforcementContext?.actionId,
        timeoutMs: config.WEATHER_PROXY_TIMEOUT_MS,
      });

      for (const [key, value] of Object.entries(upstream.responseHeaders)) {
        reply.header(key, value);
      }

      reply.status(upstream.statusCode).send(upstream.payload);
    } catch (error) {
      reply.status(502).send({
        code: "UPSTREAM_UNAVAILABLE",
        message: (error as Error).message,
        gatewayActionId: request.enforcementContext?.actionId,
      });
    }
  }
);

registerOperationalRoutes(app, { prismaClient: prisma, passportClient });

const start = async () => {
  await app.listen({ port: Number(config.GATEWAY_PORT), host: config.GATEWAY_HOST });
  app.log.info({
    signer: clients.signer.address,
    passportRegistry: config.PASSPORT_REGISTRY_ADDRESS,
    sessionRegistry: config.SESSION_REGISTRY_ADDRESS,
    receiptLog: config.RECEIPT_LOG_ADDRESS,
    routePolicyProfile: config.ROUTE_POLICY_PROFILE,
    enrichPriceAtomic: routePolicies["api.enrich-wallet"]?.priceAtomic,
    premiumPriceAtomic: routePolicies["api.premium-intel"]?.priceAtomic,
    kiteWeatherProxyPriceAtomic: routePolicies["api.kite-weather-proxy"]?.priceAtomic,
    weatherFallbackProxyPriceAtomic: routePolicies["api.weather-fallback-proxy"]?.priceAtomic,
  }, "Gateway running");
};

start().catch(async (error) => {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
