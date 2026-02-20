import { afterEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_REQUIRED_HEADER, X_ACTION_ID_HEADER, X_TX_HASH_HEADER } from "@kite-stack/shared-types";
import { proxyX402Request } from "../src/upstream/x402Proxy.js";

describe("x402 proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards payment headers and query params for GET requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "payment required",
          accepts: [{ scheme: "gokite-aa", network: "kite-testnet" }],
        }),
        {
          status: 402,
          headers: {
            "content-type": "application/json",
            [PAYMENT_REQUIRED_HEADER]: JSON.stringify({ challenge: true }),
          },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await proxyX402Request({
      upstreamUrl: "https://x402.dev.gokite.ai/api/weather",
      method: "GET",
      query: { location: "New York" },
      requestHeaders: {
        [X_ACTION_ID_HEADER.toLowerCase()]: "gateway-action-1",
        [X_TX_HASH_HEADER.toLowerCase()]: "0xabc",
      },
      gatewayActionId: "gateway-action-1",
      timeoutMs: 10_000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://x402.dev.gokite.ai/api/weather?location=New+York");
    const init = fetchMock.mock.calls[0][1];
    const headers = init?.headers as Headers;
    expect(init?.method).toBe("GET");
    expect(headers.get(X_ACTION_ID_HEADER)).toBe("gateway-action-1");
    expect(headers.get(X_TX_HASH_HEADER)).toBe("0xabc");
    expect(result.statusCode).toBe(402);
    expect(result.responseHeaders[PAYMENT_REQUIRED_HEADER.toLowerCase()]).toContain("challenge");
    expect((result.payload as { actionId?: string }).actionId).toBe("gateway-action-1");
  });

  it("sends JSON body for POST requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await proxyX402Request({
      upstreamUrl: "http://localhost:4102/api/weather",
      method: "POST",
      body: { location: "Austin", units: "metric" },
      requestHeaders: {},
      gatewayActionId: "gateway-action-2",
      timeoutMs: 10_000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1];
    const headers = init?.headers as Headers;
    expect(init?.method).toBe("POST");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ location: "Austin", units: "metric" }));
    expect(result.statusCode).toBe(200);
    expect((result.payload as { actionId?: string }).actionId).toBe("gateway-action-2");
  });
});
