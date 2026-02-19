# @kite-stack/provider-kit

Drop-in middleware for route-level policy enforcement and x402 payment gating.

## Features
- Identity + session verification hooks
- Passport policy checks (scope/service/revocation/expiry)
- Rate limiting + budget gate hooks
- Dual payment headers (`X-PAYMENT*` + `PAYMENT-*`)
- 402 challenge response helper
- Receipt writer integration hook

## Minimal Integration
```ts
import Fastify from "fastify";
import { createRouteEnforcer, routePolicies } from "@kite-stack/provider-kit";

const app = Fastify();

const enforcer = createRouteEnforcer({
  routePolicies,
  defaultPayTo: "0x...",
  defaultAsset: "0x...",
  facilitatorUrl: "https://...",
  passportClient,
  sessionClient,
  quoteStore,
  paymentService,
  nonceStore,
  budgetService,
  rateLimiter,
  receiptWriter,
  eventSink,
  signatureVerifier,
  routeIdResolver: (request) => String(request.routeOptions.config?.routeId || ""),
});

app.post(
  "/api/enrich-wallet",
  { preHandler: [enforcer], config: { routeId: "api.enrich-wallet" } },
  async () => ({ ok: true })
);
```

See example provider app in `examples/fastify-provider`.
