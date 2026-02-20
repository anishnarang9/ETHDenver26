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
  const eventSink = new InMemoryEventSink();

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
    eventSink,
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

  return { app, base, eventSink };
};

describe("provider-kit enforcement", () => {
  it("blocks requests with missing signed envelope headers", async () => {
    const { app } = makeHarness();

    const res = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        "x-action-id": "a-missing-envelope",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("INVALID_SIGNATURE");
  });

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

  it("returns 403 when service allowlist blocks an otherwise allowed scope", async () => {
    const base = makeBase();
    const serviceBlockedPassport = new InMemoryPassportClient([
      {
        owner: "0x0000000000000000000000000000000000000099",
        agent: base.agent,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        perCallCap: 2_000_000n,
        dailyCap: 5_000_000n,
        rateLimitPerMin: 2,
        revoked: false,
        scopes: ["enrich.wallet"],
        services: [],
      },
    ]);
    const serviceAllowedSession = new InMemorySessionClient([
      {
        owner: "0x0000000000000000000000000000000000000099",
        agent: base.agent,
        session: base.session,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        revoked: false,
        scopes: ["enrich.wallet"],
      },
    ]);

    const { app } = makeHarness({
      passportClient: serviceBlockedPassport,
      sessionClient: serviceAllowedSession,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "svc-1" }),
        "x-action-id": "a-service-blocked",
      },
      payload: { walletAddress: base.agent },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("SERVICE_FORBIDDEN");
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

  it("rejects payment proofs tied to a different action id", async () => {
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
        verifyPayment: async (input) => ({
          verified: input.proof.signature === `sig:${input.challenge.actionId}`,
          settlementRef: `facilitator:${input.challenge.actionId}`,
          payer: base.agent,
          amountAtomic: input.challenge.amountAtomic,
          mode: "facilitator",
          reason: "action mismatch",
        }),
      },
    });

    await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "proof-a1" }),
        "x-action-id": "a-proof-1",
      },
      payload: {},
    });

    const second = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "proof-a2" }),
        "x-action-id": "a-proof-2",
        "payment-signature": "sig:a-proof-1",
      },
      payload: {},
    });

    expect(second.statusCode).toBe(402);
    expect(second.json().code).toBe("PAYMENT_INVALID");
  });

  it("rejects direct-transfer proofs when verifier reports underpayment", async () => {
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
        verifyPayment: async (input) => ({
          verified: false,
          settlementRef: "",
          payer: base.agent,
          amountAtomic: input.challenge.amountAtomic,
          mode: "direct",
          reason: "amount below quote",
        }),
      },
    });

    const actionId = "a-direct-low";
    await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "direct-1" }),
        "x-action-id": actionId,
      },
      payload: {},
    });

    const second = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "direct-2" }),
        "x-action-id": actionId,
        "x-tx-hash": "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
      payload: {},
    });

    expect(second.statusCode).toBe(402);
    expect(second.json().code).toBe("PAYMENT_INVALID");
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

  it("returns SESSION_EXPIRED for expired sessions", async () => {
    const base = makeBase();
    const expiredSessionClient = new InMemorySessionClient([
      {
        owner: "0x0000000000000000000000000000000000000099",
        agent: base.agent,
        session: base.session,
        expiresAt: Math.floor(Date.now() / 1000) - 1,
        revoked: false,
        scopes: ["enrich.wallet"],
      },
    ]);

    const { app } = makeHarness({ sessionClient: expiredSessionClient });
    const res = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "sess-expired" }),
        "x-action-id": "a-session-expired",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("SESSION_EXPIRED");
  });

  it("returns SESSION_REVOKED for revoked sessions", async () => {
    const base = makeBase();
    const revokedSessionClient = new InMemorySessionClient([
      {
        owner: "0x0000000000000000000000000000000000000099",
        agent: base.agent,
        session: base.session,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        revoked: true,
        scopes: ["enrich.wallet"],
      },
    ]);

    const { app } = makeHarness({ sessionClient: revokedSessionClient });
    const res = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "sess-revoked" }),
        "x-action-id": "a-session-revoked",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("SESSION_REVOKED");
  });

  it("blocks requests when session is delegated to a different agent", async () => {
    const base = makeBase();
    const mismatchedSessionClient = new InMemorySessionClient([
      {
        owner: "0x0000000000000000000000000000000000000099",
        agent: "0x00000000000000000000000000000000000000ff",
        session: base.session,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        revoked: false,
        scopes: ["enrich.wallet"],
      },
    ]);

    const { app } = makeHarness({ sessionClient: mismatchedSessionClient });
    const res = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "sess-mismatch" }),
        "x-action-id": "a-session-mismatch",
      },
      payload: {},
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("INVALID_SIGNATURE");
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

  it("records events in the expected order for successful paid flow", async () => {
    const { app, base, eventSink } = makeHarness();
    const actionId = "a-order";

    const first = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "order-1" }),
        "x-action-id": actionId,
      },
      payload: {},
    });
    expect(first.statusCode).toBe(402);

    const second = await app.inject({
      method: "POST",
      url: "/api/enrich-wallet",
      headers: {
        ...envelopeHeaders({ agent: base.agent, session: base.session, nonce: "order-2" }),
        "x-action-id": actionId,
        "payment-signature": "0xorderproof",
      },
      payload: {},
    });
    expect(second.statusCode).toBe(200);

    const events = eventSink.events
      .filter((event) => event.actionId === actionId)
      .map((event) => event.eventType);

    expect(events).toEqual([
      "IDENTITY_VERIFIED",
      "SESSION_VERIFIED",
      "PASSPORT_VERIFIED",
      "SCOPE_VERIFIED",
      "SERVICE_VERIFIED",
      "RATE_LIMIT_VERIFIED",
      "BUDGET_VERIFIED",
      "QUOTE_ISSUED",
      "IDENTITY_VERIFIED",
      "SESSION_VERIFIED",
      "PASSPORT_VERIFIED",
      "SCOPE_VERIFIED",
      "SERVICE_VERIFIED",
      "RATE_LIMIT_VERIFIED",
      "BUDGET_VERIFIED",
      "PAYMENT_VERIFIED",
      "RECEIPT_RECORDED",
    ]);
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
