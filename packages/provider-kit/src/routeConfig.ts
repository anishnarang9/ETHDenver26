import type { RoutePolicy } from "@kite-stack/shared-types";

export type RoutePolicyProfile = "demo" | "test";

export interface RoutePolicyOverrides {
  enrichWalletPriceAtomic?: string;
  premiumIntelPriceAtomic?: string;
  kiteWeatherProxyPriceAtomic?: string;
  weatherFallbackProxyPriceAtomic?: string;
}

const assertAtomic = (value: string, label: string): string => {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a numeric atomic string`);
  }
  if (BigInt(value) <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
  return value;
};

export const getRoutePolicies = (
  profile: RoutePolicyProfile,
  overrides: RoutePolicyOverrides = {}
): Record<string, RoutePolicy> => {
  const defaults =
    profile === "test"
      ? {
          enrichWalletPriceAtomic: "1000",
          premiumIntelPriceAtomic: "5000",
          kiteWeatherProxyPriceAtomic: "2000",
          weatherFallbackProxyPriceAtomic: "2000",
        }
      : {
          enrichWalletPriceAtomic: "1000000",
          premiumIntelPriceAtomic: "5000000",
          kiteWeatherProxyPriceAtomic: "2000000",
          weatherFallbackProxyPriceAtomic: "2000000",
        };

  const prices = {
    enrichWalletPriceAtomic: assertAtomic(
      overrides.enrichWalletPriceAtomic ?? defaults.enrichWalletPriceAtomic,
      "enrichWalletPriceAtomic"
    ),
    premiumIntelPriceAtomic: assertAtomic(
      overrides.premiumIntelPriceAtomic ?? defaults.premiumIntelPriceAtomic,
      "premiumIntelPriceAtomic"
    ),
    kiteWeatherProxyPriceAtomic: assertAtomic(
      overrides.kiteWeatherProxyPriceAtomic ?? defaults.kiteWeatherProxyPriceAtomic,
      "kiteWeatherProxyPriceAtomic"
    ),
    weatherFallbackProxyPriceAtomic: assertAtomic(
      overrides.weatherFallbackProxyPriceAtomic ?? defaults.weatherFallbackProxyPriceAtomic,
      "weatherFallbackProxyPriceAtomic"
    ),
  };

  return {
    "api.enrich-wallet": {
      routeId: "api.enrich-wallet",
      scope: "enrich.wallet",
      service: "internal.enrich",
      priceAtomic: prices.enrichWalletPriceAtomic,
      rateLimitPerMin: 20,
      requirePayment: true,
    },
    "api.premium-intel": {
      routeId: "api.premium-intel",
      scope: "premium.intel",
      service: "external.premium",
      priceAtomic: prices.premiumIntelPriceAtomic,
      rateLimitPerMin: 5,
      requirePayment: true,
    },
    "api.kite-weather-proxy": {
      routeId: "api.kite-weather-proxy",
      scope: "weather.kite.read",
      service: "external.kite.weather",
      // Pass-through billing mode: policy checks are enforced in gateway but payment is upstream.
      priceAtomic: prices.kiteWeatherProxyPriceAtomic,
      rateLimitPerMin: 10,
      requirePayment: false,
    },
    "api.weather-fallback-proxy": {
      routeId: "api.weather-fallback-proxy",
      scope: "weather.fallback.read",
      service: "external.fallback.weather",
      // Pass-through billing mode: policy checks are enforced in gateway but payment is upstream.
      priceAtomic: prices.weatherFallbackProxyPriceAtomic,
      rateLimitPerMin: 10,
      requirePayment: false,
    },
  };
};

// Backward-compatible default export used by examples and docs.
export const routePolicies: Record<string, RoutePolicy> = getRoutePolicies("demo");
