import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAction,
  getPassport,
  getTimeline,
} from "../src/lib/api";

describe("web api client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws for failed timeline response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () => "forbidden",
      })
    );

    await expect(getTimeline("0xabc")).rejects.toThrow("forbidden");
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

  it("throws for failed action and passport responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, text: async () => "action missing" })
      .mockResolvedValueOnce({ ok: false, text: async () => "passport missing" });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAction("missing")).rejects.toThrow("action missing");
    await expect(getPassport("0xmissing")).rejects.toThrow("passport missing");
  });
});
