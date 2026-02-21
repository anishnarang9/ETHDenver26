import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  createRouteEnforcer,
  enforcementErrorHandler,
  DefaultSignatureVerifier,
  InMemoryQuoteStore,
  InMemoryNonceStore,
  InMemoryBudgetService,
  InMemoryRateLimiter,
  InMemoryReceiptWriter,
  InMemoryEventSink,
} from "@kite-stack/provider-kit";
import type { RoutePolicy } from "@kite-stack/shared-types";
import { SSEHub } from "@kite-stack/agent-core";
import { loadConfig } from "./config.js";
import { createContractClients, OnchainPassportClient, OnchainSessionClient } from "./contracts.js";
import { handleFindRestaurants } from "./handler.js";

const config = loadConfig();

const clients = createContractClients({
  rpcUrl: config.KITE_RPC_URL,
  signerPrivateKey: config.AGENT_PRIVATE_KEY,
  passportRegistryAddress: config.PASSPORT_REGISTRY_ADDRESS,
  sessionRegistryAddress: config.SESSION_REGISTRY_ADDRESS,
});

const routePolicies: Record<string, RoutePolicy> = {
  "api.find-restaurants": {
    routeId: "api.find-restaurants",
    scope: "food",
    service: "foodie",
    priceAtomic: "1000000000000000",
    rateLimitPerMin: 20,
    requirePayment: true,
  },
};

const sseHub = new SSEHub();

const enforcer = createRouteEnforcer({
  routePolicies,
  defaultPayTo: (config.PAYMENT_RECIPIENT || clients.signer.address) as `0x${string}`,
  defaultAsset: config.PAYMENT_ASSET as `0x${string}`,
  facilitatorUrl: config.FACILITATOR_URL,
  passportClient: new OnchainPassportClient(clients.passportContract),
  sessionClient: new OnchainSessionClient(clients.sessionContract),
  quoteStore: new InMemoryQuoteStore(),
  paymentService: {
    buildQuote: async (input) => ({
      actionId: input.actionId,
      routeId: input.routePolicy.routeId,
      asset: input.asset,
      amountAtomic: input.routePolicy.priceAtomic,
      payTo: input.payTo,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      facilitatorUrl: config.FACILITATOR_URL || "",
      protocolMode: "dual" as const,
    }),
    verifyPayment: async (input) => ({
      verified: true,
      settlementRef: `foodie-${Date.now()}`,
      payer: input.agentAddress,
      amountAtomic: input.challenge.amountAtomic,
      mode: "direct" as const,
    }),
  },
  nonceStore: new InMemoryNonceStore(),
  budgetService: new InMemoryBudgetService(),
  rateLimiter: new InMemoryRateLimiter(),
  receiptWriter: new InMemoryReceiptWriter(),
  eventSink: new InMemoryEventSink(),
  signatureVerifier: new DefaultSignatureVerifier(),
  routeIdResolver: (request) => {
    const routeConfig = request.routeOptions.config as unknown as Record<string, unknown> | undefined;
    return typeof routeConfig?.routeId === "string" ? routeConfig.routeId : "";
  },
});

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.setErrorHandler((error, request, reply) => {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  void enforcementErrorHandler(normalizedError, request, reply);
});

app.get("/health", async () => ({ ok: true, service: "foodie" }));

app.get("/api/events", (request, reply) => {
  sseHub.addClient(reply.raw);
  request.raw.on("close", () => sseHub.removeClient(reply.raw));
});

app.post(
  "/api/find-restaurants",
  { config: { routeId: "api.find-restaurants" }, preHandler: [enforcer] },
  async (request) => {
    const body = (request.body ?? {}) as {
      location?: string;
      date?: string;
      cuisine?: string;
      weather?: string;
      partySize?: number;
    };

    const result = await handleFindRestaurants({
      location: body.location || "Denver Convention Center",
      date: body.date || new Date().toISOString().split("T")[0]!,
      cuisine: body.cuisine,
      weather: body.weather,
      partySize: body.partySize,
      sseHub,
      openaiApiKey: config.OPENAI_API_KEY,
      firecrawlApiKey: config.FIRECRAWL_API_KEY || undefined,
    });

    return {
      actionId: (request as any).enforcementContext?.actionId,
      ...result,
    };
  }
);

export { app, config };
