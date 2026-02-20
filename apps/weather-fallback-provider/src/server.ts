import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import Fastify from "fastify";
import { Interface, JsonRpcProvider, id } from "ethers";
import type { FastifyReply } from "fastify";
import {
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  X_ACTION_ID_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  X_TX_HASH_HEADER,
  type PaymentChallenge,
} from "@kite-stack/shared-types";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  WEATHER_FALLBACK_PORT: z.string().optional().default("4102"),
  WEATHER_FALLBACK_HOST: z.string().optional().default("0.0.0.0"),
  KITE_RPC_URL: z.string().min(1),
  WEATHER_FALLBACK_ASSET: z.string().min(1),
  WEATHER_FALLBACK_PAY_TO: z.string().min(1),
  WEATHER_FALLBACK_PRICE_ATOMIC: z.string().regex(/^\d+$/).optional().default("2000"),
  WEATHER_FALLBACK_QUOTE_TTL_SECONDS: z.coerce.number().int().positive().optional().default(180),
});

const config = EnvSchema.parse(process.env);
const provider = new JsonRpcProvider(config.KITE_RPC_URL);
const app = Fastify({ logger: true });
const transferInterface = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

type ChallengeRecord = PaymentChallenge & { location: string };
const quoteStore = new Map<string, ChallengeRecord>();

const asString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
};

const makeChallenge = (actionId: string, location: string): ChallengeRecord => ({
  actionId,
  routeId: "api.weather-fallback-provider",
  asset: config.WEATHER_FALLBACK_ASSET as `0x${string}`,
  amountAtomic: config.WEATHER_FALLBACK_PRICE_ATOMIC,
  payTo: config.WEATHER_FALLBACK_PAY_TO as `0x${string}`,
  expiresAt: new Date(Date.now() + config.WEATHER_FALLBACK_QUOTE_TTL_SECONDS * 1000).toISOString(),
  facilitatorUrl: "",
  protocolMode: "dual",
  location,
});

const sendChallenge = (
  reply: FastifyReply,
  challenge: ChallengeRecord
) => {
  const encoded = JSON.stringify(challenge);
  reply.header(PAYMENT_REQUIRED_HEADER, encoded);
  reply.header(X_PAYMENT_RESPONSE_HEADER, encoded);
  reply.header(PAYMENT_RESPONSE_HEADER, encoded);
  reply.header(X_ACTION_ID_HEADER, challenge.actionId);
  reply.status(402).send({
    error: "PAYMENT_REQUIRED",
    message: "Complete direct transfer and retry with X-TX-HASH.",
    challenge,
  });
};

const deterministicWeather = (location: string) => {
  const seed = Number(BigInt(id(location)) % 100n);
  return {
    location,
    condition: seed % 2 === 0 ? "sunny" : "cloudy",
    celsius: 18 + (seed % 11),
    humidityPct: 35 + (seed % 40),
    windKph: 4 + (seed % 16),
    source: "fallback-provider",
  };
};

const verifyTransfer = async (input: {
  txHash: `0x${string}`;
  challenge: ChallengeRecord;
}): Promise<
  | {
      ok: true;
      payer: `0x${string}`;
      amountAtomic: string;
    }
  | {
      ok: false;
      reason: string;
    }
> => {
  const receipt = await provider.getTransactionReceipt(input.txHash);
  if (!receipt || receipt.status !== 1) {
    return { ok: false, reason: "transaction missing or reverted" };
  }

  const transferTopic = id("Transfer(address,address,uint256)");
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== input.challenge.asset.toLowerCase()) {
      continue;
    }
    if (log.topics[0]?.toLowerCase() !== transferTopic.toLowerCase()) {
      continue;
    }

    try {
      const parsed = transferInterface.parseLog(log);
      const from = String(parsed?.args[0]).toLowerCase() as `0x${string}`;
      const to = String(parsed?.args[1]).toLowerCase();
      const value = BigInt(parsed?.args[2]?.toString() ?? "0");

      if (to !== input.challenge.payTo.toLowerCase()) {
        continue;
      }
      if (value < BigInt(input.challenge.amountAtomic)) {
        continue;
      }

      return {
        ok: true,
        payer: from,
        amountAtomic: value.toString(),
      };
    } catch {
      continue;
    }
  }

  return { ok: false, reason: "no matching ERC20 transfer found for challenge" };
};

app.get("/health", async () => ({ ok: true }));

app.get("/api/weather", async (request, reply) => {
  const location = String((request.query as { location?: string })?.location ?? "").trim();
  if (!location) {
    reply.status(400).send({ code: "INVALID_REQUEST", message: "location query is required" });
    return;
  }

  const headerActionId = asString(request.headers[X_ACTION_ID_HEADER.toLowerCase()]);
  const txHash = asString(request.headers[X_TX_HASH_HEADER.toLowerCase()]) as `0x${string}` | undefined;
  const actionId = headerActionId ?? randomUUID();

  const challenge =
    quoteStore.get(actionId) ??
    (() => {
      const created = makeChallenge(actionId, location);
      quoteStore.set(created.actionId, created);
      return created;
    })();

  if (challenge.location !== location) {
    quoteStore.delete(actionId);
    const updated = makeChallenge(actionId, location);
    quoteStore.set(updated.actionId, updated);
    sendChallenge(reply, updated);
    return;
  }

  if (!txHash) {
    sendChallenge(reply, challenge);
    return;
  }

  if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
    const refreshed = makeChallenge(actionId, location);
    quoteStore.set(refreshed.actionId, refreshed);
    sendChallenge(reply, refreshed);
    return;
  }

  const verified = await verifyTransfer({ txHash, challenge });
  if (!verified.ok) {
    reply.status(402).send({
      code: "PAYMENT_INVALID",
      message: verified.reason,
      actionId,
    });
    return;
  }

  quoteStore.delete(actionId);
  reply.send({
    actionId,
    payment: {
      protocol: "direct-transfer",
      txHash,
      payer: verified.payer,
      payTo: challenge.payTo,
      amountAtomic: verified.amountAtomic,
      asset: challenge.asset,
    },
    weather: deterministicWeather(location),
  });
});

const start = async () => {
  await app.listen({
    host: config.WEATHER_FALLBACK_HOST,
    port: Number(config.WEATHER_FALLBACK_PORT),
  });
  app.log.info(
    {
      asset: config.WEATHER_FALLBACK_ASSET,
      payTo: config.WEATHER_FALLBACK_PAY_TO,
      priceAtomic: config.WEATHER_FALLBACK_PRICE_ATOMIC,
    },
    "Weather fallback provider running"
  );
};

start().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
