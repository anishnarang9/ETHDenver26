import { describe, expect, it } from "vitest";
import { getRoutePolicies } from "../src/routeConfig.js";

describe("route policy profiles", () => {
  it("uses demo prices by default", () => {
    const policies = getRoutePolicies("demo");
    expect(policies["api.enrich-wallet"]?.priceAtomic).toBe("1000000");
    expect(policies["api.premium-intel"]?.priceAtomic).toBe("5000000");
    expect(policies["api.kite-weather-proxy"]?.priceAtomic).toBe("2000000");
    expect(policies["api.weather-fallback-proxy"]?.priceAtomic).toBe("2000000");
    expect(policies["api.x402-proxy"]?.priceAtomic).toBe("2000000");
    expect(policies["api.kite-weather-proxy"]?.requirePayment).toBe(false);
    expect(policies["api.weather-fallback-proxy"]?.requirePayment).toBe(false);
    expect(policies["api.x402-proxy"]?.requirePayment).toBe(false);
  });

  it("uses low-cost test profile prices", () => {
    const policies = getRoutePolicies("test");
    expect(policies["api.enrich-wallet"]?.priceAtomic).toBe("1000");
    expect(policies["api.premium-intel"]?.priceAtomic).toBe("5000");
    expect(policies["api.kite-weather-proxy"]?.priceAtomic).toBe("2000");
    expect(policies["api.weather-fallback-proxy"]?.priceAtomic).toBe("2000");
    expect(policies["api.x402-proxy"]?.priceAtomic).toBe("2000");
  });

  it("supports explicit price overrides", () => {
    const policies = getRoutePolicies("test", {
      enrichWalletPriceAtomic: "123",
      premiumIntelPriceAtomic: "456",
      kiteWeatherProxyPriceAtomic: "789",
      weatherFallbackProxyPriceAtomic: "321",
      x402ProxyPriceAtomic: "654",
    });

    expect(policies["api.enrich-wallet"]?.priceAtomic).toBe("123");
    expect(policies["api.premium-intel"]?.priceAtomic).toBe("456");
    expect(policies["api.kite-weather-proxy"]?.priceAtomic).toBe("789");
    expect(policies["api.weather-fallback-proxy"]?.priceAtomic).toBe("321");
    expect(policies["api.x402-proxy"]?.priceAtomic).toBe("654");
  });

  it("rejects non-numeric atomic values", () => {
    expect(() =>
      getRoutePolicies("test", {
        enrichWalletPriceAtomic: "abc",
      })
    ).toThrow("numeric atomic string");
  });
});
