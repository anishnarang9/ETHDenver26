import { afterEach, describe, expect, it, vi } from "vitest";
import { PAYMENT_REQUIRED_HEADER, X_ACTION_ID_HEADER, X_TX_HASH_HEADER } from "@kite-stack/shared-types";
import { proxyWeatherRequest } from "../src/upstream/weatherProxy.js";

describe("weather proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards payment-related headers and injects gateway actionId in payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "X-PAYMENT header is required",
          accepts: [{ scheme: "gokite-aa" }],
        }),
        {
          status: 402,
          headers: {
            "content-type": "application/json",
            [PAYMENT_REQUIRED_HEADER]: JSON.stringify({ challenge: true }),
            [X_ACTION_ID_HEADER]: "upstream-action-1",
          },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await proxyWeatherRequest({
      upstreamUrl: "https://x402.dev.gokite.ai/api/weather",
      location: "New York",
      requestHeaders: {
        [X_ACTION_ID_HEADER.toLowerCase()]: "gateway-action-1",
        [X_TX_HASH_HEADER.toLowerCase()]: "0xabc",
      },
      gatewayActionId: "gateway-action-1",
      timeoutMs: 10_000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://x402.dev.gokite.ai/api/weather?location=New+York");
    const initHeaders = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(initHeaders.get(X_ACTION_ID_HEADER)).toBe("gateway-action-1");
    expect(initHeaders.get(X_TX_HASH_HEADER)).toBe("0xabc");

    expect(result.statusCode).toBe(402);
    expect(result.responseHeaders[PAYMENT_REQUIRED_HEADER.toLowerCase()]).toContain("challenge");
    expect((result.payload as { actionId?: string }).actionId).toBe("gateway-action-1");
  });

  it("preserves upstream actionId and adds gatewayActionId when actionId already exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          actionId: "upstream-action-2",
          weather: { condition: "sunny" },
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await proxyWeatherRequest({
      upstreamUrl: "http://localhost:4102/api/weather",
      location: "Austin",
      requestHeaders: {},
      gatewayActionId: "gateway-action-2",
      timeoutMs: 10_000,
    });

    const payload = result.payload as { actionId?: string; gatewayActionId?: string };
    expect(payload.actionId).toBe("upstream-action-2");
    expect(payload.gatewayActionId).toBe("gateway-action-2");
  });
});
