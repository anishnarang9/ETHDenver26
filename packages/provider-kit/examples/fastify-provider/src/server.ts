import Fastify from "fastify";
import {
  DefaultPaymentService,
  DefaultSignatureVerifier,
  InMemoryBudgetService,
  InMemoryEventSink,
  InMemoryNonceStore,
  InMemoryPassportClient,
  InMemoryQuoteStore,
  InMemoryRateLimiter,
  InMemoryReceiptWriter,
  InMemorySessionClient,
  createRouteEnforcer,
  enforcementErrorHandler,
  routePolicies,
} from "@kite-stack/provider-kit";
import { Wallet } from "ethers";

const app = Fastify({ logger: true });

const owner = Wallet.createRandom().address as `0x${string}`;
const agent = Wallet.createRandom().address as `0x${string}`;
const session = Wallet.createRandom().address as `0x${string}`;

const passportClient = new InMemoryPassportClient([
  {
    owner,
    agent,
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
    perCallCap: 5_000_000n,
    dailyCap: 20_000_000n,
    rateLimitPerMin: 10,
    revoked: false,
    scopes: ["enrich.wallet", "premium.intel"],
    services: ["internal.enrich", "external.premium"],
  },
]);

const sessionClient = new InMemorySessionClient([
  {
    owner,
    agent,
    session,
    expiresAt: Math.floor(Date.now() / 1000) + 1800,
    revoked: false,
    scopes: ["enrich.wallet", "premium.intel"],
  },
]);

const enforcer = createRouteEnforcer({
  routePolicies,
  defaultPayTo: Wallet.createRandom().address as `0x${string}`,
  defaultAsset: Wallet.createRandom().address as `0x${string}`,
  facilitatorUrl: "https://facilitator.example/settle",
  passportClient,
  sessionClient,
  quoteStore: new InMemoryQuoteStore(),
  paymentService: new DefaultPaymentService("https://facilitator.example/settle"),
  nonceStore: new InMemoryNonceStore(),
  budgetService: new InMemoryBudgetService(),
  rateLimiter: new InMemoryRateLimiter(),
  receiptWriter: new InMemoryReceiptWriter(),
  eventSink: new InMemoryEventSink(),
  signatureVerifier: new DefaultSignatureVerifier(),
  routeIdResolver: (request) => {
    if (request.routeOptions.url === "/api/enrich-wallet") {
      return "api.enrich-wallet";
    }
    if (request.routeOptions.url === "/api/premium-intel") {
      return "api.premium-intel";
    }
    return "";
  },
});

app.setErrorHandler((error, request, reply) => {
  void enforcementErrorHandler(error, request, reply);
});

app.post(
  "/api/enrich-wallet",
  { config: { routeId: "api.enrich-wallet" }, preHandler: [enforcer] },
  async () => ({ score: 87, tags: ["new_wallet", "active_trader"] })
);

app.post(
  "/api/premium-intel",
  { config: { routeId: "api.premium-intel" }, preHandler: [enforcer] },
  async () => ({ report: "Premium API data goes here" })
);

app
  .listen({ port: 4002, host: "0.0.0.0" })
  .then(() => {
    app.log.info({ owner, agent, session }, "Provider example ready");
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
