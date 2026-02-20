import Fastify from "fastify";
import { id } from "ethers";

const app = Fastify({ logger: true });
const port = Number(process.env.MOCK_FACILITATOR_PORT || "4100");
const host = process.env.MOCK_FACILITATOR_HOST || "0.0.0.0";

app.post("/pay", async (request, reply) => {
  const body = request.body as {
    actionId?: string;
    payer?: string;
    challenge?: {
      amountAtomic?: string;
    };
  };

  if (!body?.actionId || !body?.payer) {
    reply.status(400).send({ reason: "missing actionId or payer" });
    return;
  }

  const paymentSignature = `mock-pay:${body.actionId}:${body.payer.toLowerCase()}`;
  const txHash = id(`mock-tx:${body.actionId}:${body.payer}:${body.challenge?.amountAtomic || "0"}`) as `0x${string}`;

  reply.send({
    paymentSignature,
    txHash,
  });
});

app.post("/verify", async (request, reply) => {
  const body = request.body as {
    actionId?: string;
    paymentSignature?: string;
    quote?: {
      amountAtomic?: string;
    };
  };

  if (!body?.actionId || !body?.paymentSignature) {
    reply.status(400).send({ verified: false, reason: "missing actionId or paymentSignature" });
    return;
  }

  if (!body.paymentSignature.startsWith(`mock-pay:${body.actionId}:`)) {
    reply.send({ verified: false, reason: "signature mismatch for actionId" });
    return;
  }

  const [, , payerRaw] = body.paymentSignature.split(":");
  const payer = (payerRaw || "0x0000000000000000000000000000000000000000").toLowerCase();

  reply.send({
    verified: true,
    settlementRef: `mock-settlement:${body.actionId}`,
    txHash: id(`mock-verify-tx:${body.actionId}:${payer}`),
    payer,
    amountAtomic: body.quote?.amountAtomic || "0",
  });
});

const start = async () => {
  await app.listen({ host, port });
  app.log.info({ host, port }, "Mock facilitator running");
};

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
