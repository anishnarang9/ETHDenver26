import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  createRouteEnforcer, enforcementErrorHandler, DefaultSignatureVerifier,
  InMemoryQuoteStore, InMemoryNonceStore, InMemoryBudgetService,
  InMemoryRateLimiter, InMemoryReceiptWriter, InMemoryEventSink,
} from "@kite-stack/provider-kit";
import type { RoutePolicy } from "@kite-stack/shared-types";
import { SSEHub } from "@kite-stack/agent-core";
import { loadConfig } from "./config.js";
import { createContractClients, OnchainPassportClient, OnchainSessionClient } from "./contracts.js";
import { handleFindEvents } from "./find-handler.js";
import { handleRegisterEvent } from "./register-handler.js";

const config = loadConfig();

const clients = createContractClients({
  rpcUrl: config.KITE_RPC_URL,
  signerPrivateKey: config.AGENT_PRIVATE_KEY,
  passportRegistryAddress: config.PASSPORT_REGISTRY_ADDRESS,
  sessionRegistryAddress: config.SESSION_REGISTRY_ADDRESS,
});

const routePolicies: Record<string, RoutePolicy> = {
  "api.find-events": {
    routeId: "api.find-events",
    scope: "events",
    service: "eventbot",
    priceAtomic: "1000000000000000",
    rateLimitPerMin: 20,
    requirePayment: true,
  },
  "api.register-event": {
    routeId: "api.register-event",
    scope: "events",
    service: "eventbot",
    priceAtomic: "1000000000000000",
    rateLimitPerMin: 10,
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
      settlementRef: `eventbot-${Date.now()}`,
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

app.get("/health", async () => ({ ok: true, service: "eventbot" }));

app.get("/api/events", (request, reply) => {
  sseHub.addClient(reply.raw);
  request.raw.on("close", () => sseHub.removeClient(reply.raw));
});

app.post(
  "/api/find-events",
  { config: { routeId: "api.find-events" }, preHandler: [enforcer] },
  async (request) => {
    const body = (request.body ?? {}) as { query?: string; location?: string; dateRange?: string; interests?: string };
    const result = await handleFindEvents({
      query: body.query || "AI blockchain crypto",
      location: body.location || "Denver",
      dateRange: body.dateRange || "Feb 2026",
      interests: body.interests,
      sseHub,
      openaiApiKey: config.OPENAI_API_KEY,
      firecrawlApiKey: config.FIRECRAWL_API_KEY || undefined,
    });
    return { actionId: (request as any).enforcementContext?.actionId, ...result };
  }
);

app.post(
  "/api/register-event",
  { config: { routeId: "api.register-event" }, preHandler: [enforcer] },
  async (request) => {
    const body = (request.body ?? {}) as { eventUrl?: string; name?: string; email?: string };
    if (!body.eventUrl) return { error: "eventUrl is required" };
    const result = await handleRegisterEvent({
      eventUrl: body.eventUrl,
      name: body.name || "Anonymous",
      email: body.email || "anonymous@example.com",
      sseHub,
      openaiApiKey: config.OPENAI_API_KEY,
      firecrawlApiKey: config.FIRECRAWL_API_KEY || undefined,
    });
    return { actionId: (request as any).enforcementContext?.actionId, ...result };
  }
);

export { app, config };
