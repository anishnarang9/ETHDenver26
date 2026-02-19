import type { RoutePolicy } from "@kite-stack/shared-types";

export const routePolicies: Record<string, RoutePolicy> = {
  "api.enrich-wallet": {
    routeId: "api.enrich-wallet",
    scope: "enrich.wallet",
    service: "internal.enrich",
    priceAtomic: "1000000",
    rateLimitPerMin: 20,
    requirePayment: true,
  },
  "api.premium-intel": {
    routeId: "api.premium-intel",
    scope: "premium.intel",
    service: "external.premium",
    priceAtomic: "5000000",
    rateLimitPerMin: 5,
    requirePayment: true,
  },
};
