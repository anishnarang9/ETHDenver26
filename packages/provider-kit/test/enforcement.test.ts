import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { createRouteEnforcer, enforcementErrorHandler } from "../src/enforcement.js";
import {
  InMemoryBudgetService,
  InMemoryEventSink,
  InMemoryNonceStore,
  InMemoryPassportClient,
  InMemoryQuoteStore,
  InMemoryRateLimiter,
  InMemoryReceiptWriter,
  InMemorySessionClient,
} from "../src/inmemory.js";
import type { RoutePolicy } from "@kite-stack/shared-types";
import type { SignatureVerifier } from "../src/types.js";

const alwaysValidSignature: SignatureVerifier = {
  verify: async () => true,
};

const alwaysInvalidSignature: SignatureVerifier = {
  verify: async () => false,
};

const makeBase = () => {
  const agent = "0x0000000000000000000000000000000000000011" as `0x${string}`;
  const session = "0x0000000000000000000000000000000000000022" as `0x${string}`;

  const passportClient = new InMemoryPassportClient([
    {
      owner: "0x0000000000000000000000000000000000000099",
      agent,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      perCallCap: 2_000_000n,
      dailyCap: 5_000_000n,
      rateLimitPerMin: 2,
      revoked: false,
      scopes: ["enrich.wallet"],
      services: ["internal.enrich"],
    },
  ]);

  const sessionClient = new InMemorySessionClient([
    {
      owner: "0x0000000000000000000000000000000000000099",
      agent,
      session,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      revoked: false,
      scopes: ["enrich.wallet"],
    },
  ]);

  return {
    agent,
    session,
    passportClient,
    sessionClient,
  };
};

const envelopeHeaders = (input: { agent: string; session: string; nonce: string }) => ({
  "x-agent-address": input.agent,
  "x-session-address": input.session,
  "x-timestamp": new Date().toISOString(),
  "x-nonce": input.nonce,
  "x-body-hash": "0xabc",
  "x-signature": "0xdeadbeef",
});

type EnforcerOptions = Parameters<typeof createRouteEnforcer>[0];

const makeHarness = (overrides: Partial<EnforcerOptions> = {}) => {
  const app = Fastify();
  const base = makeBase();

  const routePolicies: Record<string, RoutePolicy> = {
    "api.enrich-wallet": {
      routeId: "api.enrich-wallet",
      scope: "enrich.wallet",
      service: "internal.enrich",
      priceAtomic: "1000000",
      rateLimitPerMin: 5,
      requirePayment: true,
    },
    "api.premium-intel": {
      routeId: "api.premium-intel",
      scope: "premium.intel",
      service: "external.premium",
      priceAtomic: "3000000",
      rateLimitPerMin: 2,
      requirePayment: true,
    },
  };

  const options: EnforcerOptions = {
    routePolicies,
    defaultPayTo: "0x00000000000000000000000000000000000000aa",
    defaultAsset: "0x00000000000000000000000000000000000000bb",
    facilitatorUrl: "https://facilitator.local",
    passportClient: base.passportClient,
    sessionClient: base.sessionClient,
    quoteStore: new InMemoryQuoteStore(),
    paymentService: {
      buildQuote: async ({ actionId, routePolicy, payTo, asset }) => ({
        actionId,
        routeId: routePolicy.routeId,
        payTo,
        asset,
        amountAtomic: routePolicy.priceAtomic,
        expiresAt: new Date(Date.now() + 120000).toISOString(),
        facilitatorUrl: "https://facilitator.local",
        protocolMode: "dual",
      }),
      verifyPayment: async (input) => ({
        verified: true,
        settlementRef: `facilitator:${input.challenge.actionId}`,
        payer: base.agent,
        amountAtomic: input.challenge.amountAtomic,
        mode: "facilitator",
      }),
    },
    nonceStore: new InMemoryNonceStore(),
    budgetService: new InMemoryBudgetService(),
    rateLimiter: new InMemoryRateLimiter(),
    receiptWriter: new InMemoryReceiptWriter(),
    eventSink: new InMemoryEventSink(),
    signatureVerifier: alwaysValidSignature,
    routeIdResolver: (request) =>
      request.routeOptions.url === "/api/premium-intel" ? "api.premium-intel" : "api.enrich-wallet",
    ...overrides,
  };

  const enforcer = createRouteEnforcer(options);

  app.setErrorHandler((error, request, reply) => {
    void enforcementErrorHandler(error, request, reply);
  });

  app.post(
    "/api/enrich-wallet",
    { preHandler: [enforcer], config: { routeId: "api.enrich-wallet" } },
    async (request) => ({ ok: true, actionId: request.enforcementContext?.actionId })
  );

  app.post(
    "/api/premium-intel",
    { preHandler: [enforcer], config: { routeId: "api.premium-intel" } },
    async (request) => ({ ok: true, actionId: request.enforcementContext?.actionId })
  );

  return { app, base };
};

describe("provider-kit enforcement", () => {
  it("returns 402 challenge when payment proof is missing", async () => {
    const { app, base } = makeHarness();

    const res = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "n1" }),
        "x-action-id": "a-1",
      },
      payload: { walletAddress: base.agent },
    });

    expect(res.statusCode).toBe(402);
    expect(res.headers["payment-required"]).toBeTruthy();
  });

  it("returns 403 for forbidden scope/service route", async () => {
    const { app, base } = makeHarness();

    const res = await app.inject({
      method: "POST",
      url: "/api/premium-intel",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "n2" }),
        "x-action-id": "a-2",
      },
      payload: { walletAddress: base.agent },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const { app, base } = makeHarness({
      routePolicies: {
        "api.enrich-wallet": {
          routeId: "api.enrich-wallet",
          scope: "enrich.wallet",
          service: "internal.enrich",
          priceAtomic: "1000000",
          rateLimitPerMin: 1,
          requirePayment: false,
        },
      },
      routeIdResolver: () => "api.enrich-wallet",
    });

    const first = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "r1" }),
        "x-action-id": "a-3",
      },
      payload: { walletAddress: base.agent },
    });

    const second = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "r2" }),
        "x-action-id": "a-4",
      },
      payload: { walletAddress: base.agent },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
  });

  it("accepts PAYMENT-SIGNATURE proof on retry", async () => {
    const { app, base } = makeHarness();
    const actionId = "a-5";

    const first = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "p1" }),
        "x-action-id": actionId,
      },
      payload: { walletAddress: base.agent },
    });

    expect(first.statusCode).toBe(402);

    const second = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "p2" }),
        "x-action-id": actionId,
        "payment-signature": "0xsignedproof",
      },
      payload: { walletAddress: base.agent },
    });

    expect(second.statusCode).toBe(200);
  });

  it("accepts legacy X-PAYMENT proof on retry", async () => {
    const { app, base } = makeHarness();
    const actionId = "a-6";

    await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "p3" }),
        "x-action-id": actionId,
      },
      payload: { walletAddress: base.agent },
    });

    const second = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "p4" }),
        "x-action-id": actionId,
        "x-payment": "0xlegacyproof",
      },
      payload: { walletAddress: base.agent },
    });

    expect(second.statusCode).toBe(200);
  });

  it("blocks replayed nonce", async () => {
    const { app, base } = makeHarness({
      routePolicies: {
        "api.enrich-wallet": {
          routeId: "api.enrich-wallet",
          scope: "enrich.wallet",
          service: "internal.enrich",
          priceAtomic: "1000000",
          rateLimitPerMin: 5,
          requirePayment: false,
        },
      },
      routeIdResolver: () => "api.enrich-wallet",
    });

    const headers = {
      ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "same-nonce" }),
      "x-action-id": "a-7",
    };

    const first = await app.inject({ method: "POST", url: "/api/enrich-wallet", headers, payload: {} });
    const second = await app.inject({ method: "POST", url: "/api/enrich-wallet", headers, payload: {} });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
  });

  it("blocks revoked passports", async () => {
    const base = makeBase();
    const revokedPassportClient = new InMemoryPassportClient([
      {
        owner: "0x0000000000000000000000000000000000000099",
        agent: base.agent,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        perCallCap: 2_000_000n,
        dailyCap: 5_000_000n,
        rateLimitPerMin: 2,
        revoked: true,
        scopes: ["enrich.wallet"],
        services: ["internal.enrich"],
      },
    ]);

    const { app } = makeHarness({ passportClient: revokedPassportClient });

    const res = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "n-revoked" }),
        "x-action-id": "a-8",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(403);
  });

  it("blocks per-call cap violations", async () => {
    const base = makeBase();
    const lowCapPassport = new InMemoryPassportClient([
      {
        owner: "0x0000000000000000000000000000000000000099",
        agent: base.agent,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        perCallCap: 100n,
        dailyCap: 5_000_000n,
        rateLimitPerMin: 2,
        revoked: false,
        scopes: ["enrich.wallet"],
        services: ["internal.enrich"],
      },
    ]);

    const { app } = makeHarness({ passportClient: lowCapPassport });

    const res = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "n-cap" }),
        "x-action-id": "a-9",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(403);
  });

  it("blocks when budget service denies daily spend", async () => {
    const { app, base } = makeHarness({
      budgetService: {
        canSpend: async () => false,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "n-budget" }),
        "x-action-id": "a-10",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(403);
  });

  it("blocks invalid request signatures", async () => {
    const { app, base } = makeHarness({ signatureVerifier: alwaysInvalidSignature });

    const res = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "n-sig" }),
        "x-action-id": "a-11",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(401);
  });

  it("returns PAYMENT_INVALID when verifier rejects proof", async () => {
    const { app, base } = makeHarness({
      paymentService: {
        buildQuote: async ({ actionId, routePolicy, payTo, asset }) => ({
          actionId,
          routeId: routePolicy.routeId,
          payTo,
          asset,
          amountAtomic: routePolicy.priceAtomic,
          expiresAt: new Date(Date.now() + 120000).toISOString(),
          facilitatorUrl: "https://facilitator.local",
          protocolMode: "dual",
        }),
        verifyPayment: async () => ({
          verified: false,
          settlementRef: "",
          payer: base.agent,
          amountAtomic: "1000000",
          mode: "facilitator",
          reason: "invalid proof",
        }),
      },
    });

    const actionId = "a-12";
    await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "n-v1" }),
        "x-action-id": actionId,
      },
      payload: {},
    });

    const second = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "n-v2" }),
        "x-action-id": actionId,
        "payment-signature": "0xinvalid",
      },
      payload: {},
    });

    expect(second.statusCode).toBe(402);
  });

  it("rejects expired quotes before verification", async () => {
    const { app, base } = makeHarness({
      paymentService: {
        buildQuote: async ({ actionId, routePolicy, payTo, asset }) => ({
          actionId,
          routeId: routePolicy.routeId,
          payTo,
          asset,
          amountAtomic: routePolicy.priceAtomic,
          expiresAt: new Date(Date.now() - 1000).toISOString(),
          facilitatorUrl: "https://facilitator.local",
          protocolMode: "dual",
        }),
        verifyPayment: async () => ({
          verified: true,
          settlementRef: "facilitator:ok",
          payer: base.agent,
          amountAtomic: "1000000",
          mode: "facilitator",
        }),
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "n-expired" }),
        "x-action-id": "a-13",
        "payment-signature": "0xproof",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(402);
  });
});
