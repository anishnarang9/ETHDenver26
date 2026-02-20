import type { RoutePolicy } from "@kite-stack/shared-types";

export type RoutePolicyProfile = "demo" | "test";

export interface RoutePolicyOverrides {
  enrichWalletPriceAtomic?: string;
  premiumIntelPriceAtomic?: string;
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
        }
      : {
          enrichWalletPriceAtomic: "1000000",
          premiumIntelPriceAtomic: "5000000",
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
  };
};

// Backward-compatible default export used by examples and docs.
export const routePolicies: Record<string, RoutePolicy> = getRoutePolicies("demo");
