import Fastify from "fastify";
import cors from "@fastify/cors";
import { ethers, Wallet } from "ethers";
import { prisma } from "@kite-stack/db";
import {
  DefaultSignatureVerifier,
  createRouteEnforcer,
  enforcementErrorHandler,
  routePolicies,
} from "@kite-stack/provider-kit";
import { loadConfig } from "./config.js";
import {
  OnchainPassportClient,
  OnchainReceiptWriter,
  OnchainSessionClient,
  createContractClients,
} from "./contracts.js";
import { KitePaymentService } from "./payment.js";
import {
  InMemoryRateLimiter,
  PrismaBudgetService,
  PrismaEventSink,
  PrismaNonceStore,
  PrismaQuoteStore,
  PrismaReceiptWriter,
} from "./storage.js";

const config = loadConfig();

const clients = createContractClients({
  rpcUrl: config.KITE_RPC_URL,
  signerPrivateKey: config.GATEWAY_SIGNER_PRIVATE_KEY,
  passportRegistryAddress: config.PASSPORT_REGISTRY_ADDRESS,
  sessionRegistryAddress: config.SESSION_REGISTRY_ADDRESS,
  receiptLogAddress: config.RECEIPT_LOG_ADDRESS,
});

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const passportClient = new OnchainPassportClient(clients.passportContract);
const sessionClient = new OnchainSessionClient(clients.sessionContract);
const quoteStore = new PrismaQuoteStore();
const eventSink = new PrismaEventSink();
const paymentService = new KitePaymentService(config.FACILITATOR_URL, clients.provider);
const receiptWriter = new PrismaReceiptWriter(new OnchainReceiptWriter(clients.receiptContract));

const enforcer = createRouteEnforcer({
  routePolicies,
  defaultPayTo: config.PAYMENT_RECIPIENT as `0x${string}`,
  defaultAsset: config.PAYMENT_ASSET as `0x${string}`,
  facilitatorUrl: config.FACILITATOR_URL,
  passportClient,
  sessionClient,
  quoteStore,
  paymentService,
  nonceStore: new PrismaNonceStore(),
  budgetService: new PrismaBudgetService(),
  rateLimiter: new InMemoryRateLimiter(),
  receiptWriter,
  eventSink,
  signatureVerifier: new DefaultSignatureVerifier(),
  routeIdResolver: (request) => {
    const routeConfig = request.routeOptions.config as unknown as Record<string, unknown> | undefined;
    return typeof routeConfig?.routeId === "string" ? routeConfig.routeId : "";
  },
});

app.setErrorHandler((error, request, reply) => {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  void enforcementErrorHandler(normalizedError, request, reply);
});

app.get("/health", async () => ({ ok: true }));

app.post(
  "/api/enrich-wallet",
  { config: { routeId: "api.enrich-wallet" }, preHandler: [enforcer] },
  async (request) => {
    const body = (request.body ?? {}) as { walletAddress?: string; activityHint?: string };
    const walletAddress = (body.walletAddress || Wallet.createRandom().address).toLowerCase();
    const activityHint = body.activityHint || "unknown";

    const entropy = Number(BigInt(ethers.id(`${walletAddress}:${activityHint}`)) % 100n);
    const score = 50 + Math.floor(entropy / 2);

    return {
      actionId: request.enforcementContext?.actionId,
      walletAddress,
      riskScore: score,
      labels: score > 80 ? ["active_trader", "high_velocity"] : ["steady_user"],
      explanation: `Generated deterministic intelligence from wallet ${walletAddress} and activity hint ${activityHint}.`,
    };
  }
);

app.post(
  "/api/premium-intel",
  { config: { routeId: "api.premium-intel" }, preHandler: [enforcer] },
  async (request) => {
    const payload = request.body as Record<string, unknown>;

    if (config.PREMIUM_API_URL && config.PREMIUM_API_KEY) {
      const response = await fetch(config.PREMIUM_API_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.PREMIUM_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload ?? {}),
      });

      if (response.ok) {
        return {
          actionId: request.enforcementContext?.actionId,
          source: "external",
          data: await response.json(),
        };
      }
    }

    return {
      actionId: request.enforcementContext?.actionId,
      source: "mock",
      data: {
        signal: "premium-intel-fallback",
        confidence: 0.78,
        notes: "External provider unavailable; using deterministic fallback.",
      },
    };
  }
);

app.get("/api/passport/:agent", async (request, reply) => {
  const params = request.params as { agent: string };
  const agent = params.agent as `0x${string}`;

  const passport = await passportClient.getPassport(agent);
  if (!passport) {
    reply.status(404).send({ message: "passport not found" });
    return;
  }

  const agentRecord = await prisma.agent.findUnique({
    where: {
      agentAddress: agent.toLowerCase(),
    },
    include: {
      passportHistory: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
  });

  const latestSnapshot = agentRecord?.passportHistory[0];

  reply.send({
    onchain: passport,
    latestSnapshot: latestSnapshot
      ? {
          expiresAt: latestSnapshot.expiresAt.toISOString(),
          perCallCap: latestSnapshot.perCallCap.toString(),
          dailyCap: latestSnapshot.dailyCap.toString(),
          rateLimitPerMin: latestSnapshot.rateLimitPerMin,
          scopes: latestSnapshot.scopesJson,
          services: latestSnapshot.servicesJson,
          revoked: latestSnapshot.revoked,
          txHash: latestSnapshot.txHash,
        }
      : null,
  });
});

app.post("/api/passport/revoke", async (request, reply) => {
  const body = request.body as { agentAddress: string; ownerPrivateKey: string };
  const owner = new Wallet(body.ownerPrivateKey, clients.provider);
  const passportAsOwner = clients.passportContract.connect(owner);

  const tx = await (passportAsOwner as any).revokePassport(body.agentAddress);
  const receipt = await tx.wait();

  const agentRecord = await prisma.agent.findUnique({
    where: {
      agentAddress: body.agentAddress.toLowerCase(),
    },
  });

  if (agentRecord) {
    await prisma.passportSnapshot.updateMany({
      where: {
        agentId: agentRecord.id,
      },
      data: {
        revoked: true,
        txHash: tx.hash,
      },
    });
  }

  reply.send({
    revoked: true,
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber,
  });
});

app.post("/api/passport/upsert", async (request, reply) => {
  const body = request.body as {
    agentAddress: string;
    ownerPrivateKey: string;
    expiresAt: number;
    perCallCap: string;
    dailyCap: string;
    rateLimitPerMin: number;
    scopes: string[];
    services: string[];
  };

  const owner = new Wallet(body.ownerPrivateKey, clients.provider);
  const passportAsOwner = clients.passportContract.connect(owner);

  const tx = await (passportAsOwner as any).upsertPassport(
    body.agentAddress,
    body.expiresAt,
    BigInt(body.perCallCap),
    BigInt(body.dailyCap),
    body.rateLimitPerMin,
    body.scopes.map((scope) => ethers.id(scope)),
    body.services.map((service) => ethers.id(service))
  );

  await tx.wait();

  const agent = await prisma.agent.upsert({
    where: { agentAddress: body.agentAddress.toLowerCase() },
    create: {
      agentAddress: body.agentAddress.toLowerCase(),
      ownerAddress: owner.address.toLowerCase(),
    },
    update: {
      ownerAddress: owner.address.toLowerCase(),
    },
  });

  await prisma.passportSnapshot.create({
    data: {
      agentId: agent.id,
      expiresAt: new Date(body.expiresAt * 1000),
      perCallCap: body.perCallCap,
      dailyCap: body.dailyCap,
      rateLimitPerMin: body.rateLimitPerMin,
      scopesJson: body.scopes,
      servicesJson: body.services,
      revoked: false,
      txHash: tx.hash,
    },
  });

  reply.send({
    upserted: true,
    txHash: tx.hash,
    explorerLink: config.EXPLORER_BASE_URL ? `${config.EXPLORER_BASE_URL}/tx/${tx.hash}` : null,
  });
});

app.post("/api/session/grant", async (request, reply) => {
  const body = request.body as {
    ownerPrivateKey: string;
    agentAddress: string;
    sessionAddress: string;
    expiresAt: number;
    scopes: string[];
  };

  const owner = new Wallet(body.ownerPrivateKey, clients.provider);
  const sessionAsOwner = clients.sessionContract.connect(owner);

  const tx = await (sessionAsOwner as any).grantSession(
    body.agentAddress,
    body.sessionAddress,
    body.expiresAt,
    body.scopes.map((scope) => ethers.id(scope))
  );
  await tx.wait();

  const agent = await prisma.agent.upsert({
    where: { agentAddress: body.agentAddress.toLowerCase() },
    create: {
      agentAddress: body.agentAddress.toLowerCase(),
      ownerAddress: owner.address.toLowerCase(),
    },
    update: {
      ownerAddress: owner.address.toLowerCase(),
    },
  });

  await prisma.session.upsert({
    where: {
      sessionAddress: body.sessionAddress.toLowerCase(),
    },
    create: {
      agentId: agent.id,
      sessionAddress: body.sessionAddress.toLowerCase(),
      expiresAt: new Date(body.expiresAt * 1000),
      revoked: false,
      scopeSubsetJson: body.scopes,
      txHash: tx.hash,
    },
    update: {
      expiresAt: new Date(body.expiresAt * 1000),
      revoked: false,
      scopeSubsetJson: body.scopes,
      txHash: tx.hash,
    },
  });

  reply.send({
    granted: true,
    txHash: tx.hash,
  });
});

app.get("/api/actions/:actionId", async (request, reply) => {
  const { actionId } = request.params as { actionId: string };

  const action = await prisma.actionAttempt.findUnique({
    where: { actionId },
    include: {
      paymentQuote: true,
      paymentSettlement: true,
      events: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!action) {
    reply.status(404).send({ message: "action not found" });
    return;
  }

  reply.send(action);
});

app.get("/api/timeline/:agent", async (request, reply) => {
  const { agent } = request.params as { agent: string };

  const events = await prisma.enforcementEvent.findMany({
    where: {
      agentAddress: agent.toLowerCase(),
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 200,
  });

  reply.send({ events });
});

app.get("/api/timeline/:agent/stream", async (request, reply) => {
  const { agent } = request.params as { agent: string };

  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.flushHeaders();

  let closed = false;

  const sendBatch = async () => {
    const rows = await prisma.enforcementEvent.findMany({
      where: { agentAddress: agent.toLowerCase() },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    reply.raw.write(`data: ${JSON.stringify(rows)}\n\n`);
  };

  const interval = setInterval(() => {
    if (!closed) {
      void sendBatch();
    }
  }, 3000);

  request.raw.on("close", () => {
    closed = true;
    clearInterval(interval);
    reply.raw.end();
  });

  await sendBatch();
  return reply;
});

const start = async () => {
  await app.listen({ port: Number(config.GATEWAY_PORT), host: config.GATEWAY_HOST });
  app.log.info({
    signer: clients.signer.address,
    passportRegistry: config.PASSPORT_REGISTRY_ADDRESS,
    sessionRegistry: config.SESSION_REGISTRY_ADDRESS,
    receiptLog: config.RECEIPT_LOG_ADDRESS,
  }, "Gateway running");
};

start().catch(async (error) => {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
