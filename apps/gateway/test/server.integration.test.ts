import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerOperationalRoutes } from "../src/operationalRoutes.js";

const makePrismaMock = () => ({
  agent: {
    findUnique: vi.fn(),
  },
  actionAttempt: {
    findUnique: vi.fn(),
  },
  enforcementEvent: {
    findMany: vi.fn(),
  },
});

describe("gateway operational routes", () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];

  afterEach(async () => {
    for (const app of apps.splice(0, apps.length)) {
      await app.close();
    }
  });

  it("returns 404 then success for GET /api/passport/:agent", async () => {
    const prismaMock = makePrismaMock();
    prismaMock.agent.findUnique.mockResolvedValueOnce(null);
    prismaMock.agent.findUnique.mockResolvedValueOnce({
      passportHistory: [
        {
          expiresAt: new Date("2026-01-01T00:00:00.000Z"),
          perCallCap: { toString: () => "1000" },
          dailyCap: { toString: () => "5000" },
          rateLimitPerMin: 10,
          scopesJson: ["enrich.wallet"],
          servicesJson: ["internal.enrich"],
          revoked: false,
          txHash: "0xabc",
        },
      ],
    });

    const passportClient = {
      getPassport: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          owner: "0x0000000000000000000000000000000000000001",
          agent: "0x0000000000000000000000000000000000000002",
          expiresAt: 1_700_000_000,
          perCallCap: 1000n,
          dailyCap: 5000n,
          rateLimitPerMin: 10,
          revoked: false,
          scopes: ["enrich.wallet"],
          services: ["internal.enrich"],
        }),
    };

    const app = Fastify();
    apps.push(app);
    registerOperationalRoutes(app, {
      prismaClient: prismaMock as never,
      passportClient: passportClient as never,
    });

    const notFound = await app.inject({
      method: "GET",
      url: "/api/passport/0x0000000000000000000000000000000000000002",
    });
    expect(notFound.statusCode).toBe(404);

    const found = await app.inject({
      method: "GET",
      url: "/api/passport/0x0000000000000000000000000000000000000002",
    });
    expect(found.statusCode).toBe(200);
    expect(found.json().onchain.agent).toBe("0x0000000000000000000000000000000000000002");
  });

  it("returns 404 then success for GET /api/actions/:actionId", async () => {
    const prismaMock = makePrismaMock();
    prismaMock.actionAttempt.findUnique.mockResolvedValueOnce(null);
    prismaMock.actionAttempt.findUnique.mockResolvedValueOnce({
      actionId: "a-1",
      paymentQuote: null,
      paymentSettlement: null,
      events: [],
    });

    const app = Fastify();
    apps.push(app);
    registerOperationalRoutes(app, {
      prismaClient: prismaMock as never,
      passportClient: { getPassport: vi.fn() } as never,
    });

    const notFound = await app.inject({
      method: "GET",
      url: "/api/actions/a-1",
    });
    expect(notFound.statusCode).toBe(404);

    const found = await app.inject({
      method: "GET",
      url: "/api/actions/a-1",
    });
    expect(found.statusCode).toBe(200);
    expect(found.json().actionId).toBe("a-1");
  });

  it("returns timeline events sorted from prisma query", async () => {
    const prismaMock = makePrismaMock();
    prismaMock.enforcementEvent.findMany.mockResolvedValue([
      { id: "2", createdAt: "2026-01-02T00:00:00.000Z" },
      { id: "1", createdAt: "2026-01-01T00:00:00.000Z" },
    ]);

    const app = Fastify();
    apps.push(app);
    registerOperationalRoutes(app, {
      prismaClient: prismaMock as never,
      passportClient: { getPassport: vi.fn() } as never,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline/0x0000000000000000000000000000000000000002",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events[0].id).toBe("2");
    expect(prismaMock.enforcementEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
      })
    );
  });

  it("streams first payload in SSE mode", async () => {
    const prismaMock = makePrismaMock();
    prismaMock.enforcementEvent.findMany.mockResolvedValue([{ id: "e-1", eventType: "QUOTE_ISSUED" }]);

    const app = Fastify();
    apps.push(app);
    registerOperationalRoutes(app, {
      prismaClient: prismaMock as never,
      passportClient: { getPassport: vi.fn() } as never,
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/timeline/0x0000000000000000000000000000000000000002/stream?once=1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain("data:");
    expect(response.body).toContain("QUOTE_ISSUED");
  });
});
