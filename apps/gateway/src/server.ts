import Fastify from "fastify";
import cors from "@fastify/cors";
import { ethers, Wallet } from "ethers";
import { z } from "zod";
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
import { proxyX402Request } from "./upstream/x402Proxy.js";
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
  x402ProxyPriceAtomic: config.TEST_PRICE_X402_PROXY_ATOMIC,
});

const ProxyRequestSchema = z.object({
  upstreamUrl: z.string().url(),
  method: z.enum(["GET", "POST"]).optional().default("GET"),
  query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  body: z.unknown().optional(),
});

const allowedProxyHosts = new Set(
  config.X402_PROXY_ALLOWED_HOSTS.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
);

const isAllowedProxyHost = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return allowedProxyHosts.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const isKiteWeatherUpstream = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase() === "x402.dev.gokite.ai" && parsed.pathname.startsWith("/api/weather");
  } catch {
    return false;
  }
};

const hasGokiteAaChallenge = (payload: unknown): boolean => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  const accepts = (payload as { accepts?: unknown }).accepts;
  if (!Array.isArray(accepts)) {
    return false;
  }
  return accepts.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return false;
    }
    const item = entry as { scheme?: unknown; network?: unknown };
    return item.scheme === "gokite-aa" && item.network === "kite-testnet";
  });
};

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

app.post(
  "/api/x402-proxy",
  { config: { routeId: "api.x402-proxy" }, preHandler: [enforcer] },
  async (request, reply) => {
    const parsed = ProxyRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.status(400).send({
        code: "INVALID_REQUEST",
        message: "Invalid proxy request body",
        issues: parsed.error.issues,
        gatewayActionId: request.enforcementContext?.actionId,
      });
      return;
    }

    const input = parsed.data;
    if (!isAllowedProxyHost(input.upstreamUrl)) {
      reply.status(403).send({
        code: "UPSTREAM_HOST_BLOCKED",
        message: "upstreamUrl host is not allowed by gateway policy",
        gatewayActionId: request.enforcementContext?.actionId,
      });
      return;
    }

    try {
      const upstream = await proxyX402Request({
        upstreamUrl: input.upstreamUrl,
        method: input.method,
        query: input.query,
        body: input.body,
        requestHeaders: request.headers as Record<string, unknown>,
        gatewayActionId: request.enforcementContext?.actionId,
        timeoutMs: config.WEATHER_PROXY_TIMEOUT_MS,
      });

      const location = typeof input.query?.location === "string" ? input.query.location : undefined;
      const shouldFallbackForWeather =
        upstream.statusCode === 402 &&
        !!location &&
        isKiteWeatherUpstream(input.upstreamUrl) &&
        hasGokiteAaChallenge(upstream.payload);

      if (shouldFallbackForWeather) {
        const fallback = await proxyWeatherRequest({
          upstreamUrl: `${config.WEATHER_FALLBACK_BASE_URL.replace(/\/$/, "")}/api/weather`,
          location,
          requestHeaders: request.headers as Record<string, unknown>,
          gatewayActionId: request.enforcementContext?.actionId,
          timeoutMs: config.WEATHER_PROXY_TIMEOUT_MS,
        });

        for (const [key, value] of Object.entries(fallback.responseHeaders)) {
          reply.header(key, value);
        }

        reply.header("x-proxy-mode", "weather-fallback");
        reply.status(fallback.statusCode).send(fallback.payload);
        return;
      }

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
    x402ProxyPriceAtomic: routePolicies["api.x402-proxy"]?.priceAtomic,
    x402ProxyAllowedHosts: [...allowedProxyHosts],
  }, "Gateway running");
};

start().catch(async (error) => {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
