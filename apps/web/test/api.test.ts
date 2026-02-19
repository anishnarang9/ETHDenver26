import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAction,
  getPassport,
  getTimeline,
  grantSession,
  revokePassport,
  upsertPassport,
} from "../src/lib/api";

describe("web api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("upserts passport successfully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ txHash: "0x123", explorerLink: null }),
      })
    );

    const result = await upsertPassport({
      ownerPrivateKey: "0xowner",
      agentAddress: "0xagent",
      expiresAt: 123,
      perCallCap: "1",
      dailyCap: "10",
      rateLimitPerMin: 1,
      scopes: ["enrich.wallet"],
      services: ["internal.enrich"],
    });

    expect(result.txHash).toBe("0x123");
  });

  it("throws for failed revoke response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () => "forbidden",
      })
    );

    await expect(revokePassport({ ownerPrivateKey: "x", agentAddress: "y" })).rejects.toThrow("forbidden");
  });

  it("loads timeline payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ events: [{ id: "1", eventType: "QUOTE_ISSUED" }] }),
      })
    );

    const result = await getTimeline("0xabc");
    expect(result.events).toHaveLength(1);
  });

  it("loads action and passport payloads", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ actionId: "a1" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ onchain: { agent: "0x1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    const action = await getAction("a1");
    const passport = await getPassport("0x1");

    expect(action).toMatchObject({ actionId: "a1" });
    expect(passport).toMatchObject({ onchain: { agent: "0x1" } });
  });

  it("posts session grant request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ txHash: "0xsession" }) })
    );

    const result = await grantSession({
      ownerPrivateKey: "0xowner",
      agentAddress: "0xagent",
      sessionAddress: "0xsession",
      expiresAt: 123,
      scopes: ["enrich.wallet"],
    });

    expect(result.txHash).toBe("0xsession");
  });
});
