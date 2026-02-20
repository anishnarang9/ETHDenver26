import type { FastifyInstance } from "fastify";

interface GatewayPrismaLike {
  agent: {
    findUnique: (...args: any[]) => Promise<any>;
  };
  actionAttempt: {
    findUnique: (...args: any[]) => Promise<any>;
  };
  enforcementEvent: {
    findMany: (...args: any[]) => Promise<any[]>;
  };
}

interface PassportReader {
  getPassport: (agent: `0x${string}`) => Promise<any | null>;
}

export const registerOperationalRoutes = (
  app: FastifyInstance,
  deps: {
    prismaClient: GatewayPrismaLike;
    passportClient: PassportReader;
  }
) => {
  const { prismaClient, passportClient } = deps;
  const serializePassport = (passport: any) => ({
    ...passport,
    perCallCap:
      typeof passport?.perCallCap === "bigint"
        ? passport.perCallCap.toString()
        : passport?.perCallCap,
    dailyCap:
      typeof passport?.dailyCap === "bigint"
        ? passport.dailyCap.toString()
        : passport?.dailyCap,
  });

  app.get("/api/passport/:agent", async (request, reply) => {
    const params = request.params as { agent: string };
    const agent = params.agent as `0x${string}`;

    const passport = await passportClient.getPassport(agent);
    if (!passport) {
      reply.status(404).send({ message: "passport not found" });
      return;
    }

    const agentRecord = await prismaClient.agent.findUnique({
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

    const latestSnapshot = agentRecord?.passportHistory?.[0];

    reply.send({
      onchain: serializePassport(passport),
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

  app.get("/api/actions/:actionId", async (request, reply) => {
    const { actionId } = request.params as { actionId: string };

    const action = await prismaClient.actionAttempt.findUnique({
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

    const events = await prismaClient.enforcementEvent.findMany({
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
    const query = request.query as { once?: string } | undefined;
    const once = query?.once === "1";

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders();

    let closed = false;

    const sendBatch = async () => {
      const rows = await prismaClient.enforcementEvent.findMany({
        where: { agentAddress: agent.toLowerCase() },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      reply.raw.write(`data: ${JSON.stringify(rows)}\n\n`);
    };

    if (once) {
      await sendBatch();
      reply.raw.end();
      return reply;
    }

    const interval = setInterval(() => {
      if (!closed) {
        void sendBatch();
      }
    }, 3000);
    interval.unref();

    request.raw.on("close", () => {
      closed = true;
      clearInterval(interval);
      reply.raw.end();
    });

    await sendBatch();
    return reply;
  });
};
