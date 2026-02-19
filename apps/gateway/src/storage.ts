import { prisma } from "@kite-stack/db";
import type {
  BudgetService,
  EventSink,
  NonceStore,
  QuoteStore,
  RateLimiter,
  ReceiptWriter,
} from "@kite-stack/provider-kit";
import type { EnforcementEvent, PaymentChallenge } from "@kite-stack/shared-types";
import { OnchainReceiptWriter } from "./contracts.js";

const ensureAgent = async (agentAddress: `0x${string}`) =>
  prisma.agent.upsert({
    where: { agentAddress: agentAddress.toLowerCase() },
    create: {
      agentAddress: agentAddress.toLowerCase(),
      ownerAddress: "unknown",
    },
    update: {},
  });

const ensureActionAttempt = async (actionId: string, agentAddress: `0x${string}`, routeId: string) => {
  const agent = await ensureAgent(agentAddress);
  return prisma.actionAttempt.upsert({
    where: { actionId },
    create: {
      actionId,
      agentId: agent.id,
      routeId,
      status: "CREATED",
      protocolMode: "dual",
    },
    update: {
      routeId,
      updatedAt: new Date(),
    },
  });
};

export class PrismaQuoteStore implements QuoteStore {
  async get(actionId: string): Promise<PaymentChallenge | null> {
    const row = await prisma.paymentQuote.findFirst({
      where: {
        actionAttempt: { is: { actionId } },
      },
      include: {
        actionAttempt: true,
      },
    });

    if (!row) {
      return null;
    }

    return {
      actionId,
      routeId: row.actionAttempt.routeId,
      asset: row.asset as `0x${string}`,
      amountAtomic: row.amount.toString(),
      payTo: row.payTo as `0x${string}`,
      expiresAt: row.expiresAt.toISOString(),
      facilitatorUrl: row.facilitatorUrl,
      protocolMode: "dual",
    };
  }

  async save(actionId: string, challenge: PaymentChallenge, routeId: string, agent: `0x${string}`): Promise<void> {
    const action = await ensureActionAttempt(actionId, agent, routeId);

    await prisma.paymentQuote.upsert({
      where: { actionAttemptId: action.id },
      create: {
        actionAttemptId: action.id,
        payTo: challenge.payTo,
        amount: challenge.amountAtomic,
        asset: challenge.asset,
        facilitatorUrl: challenge.facilitatorUrl,
        expiresAt: new Date(challenge.expiresAt),
      },
      update: {
        payTo: challenge.payTo,
        amount: challenge.amountAtomic,
        asset: challenge.asset,
        facilitatorUrl: challenge.facilitatorUrl,
        expiresAt: new Date(challenge.expiresAt),
      },
    });

    await prisma.actionAttempt.update({
      where: { id: action.id },
      data: {
        status: "QUOTED",
        quoteAmount: challenge.amountAtomic,
        quoteAsset: challenge.asset,
        quoteExpiresAt: new Date(challenge.expiresAt),
      },
    });
  }

  async markSettled(actionId: string, settlementRef: string, txHash?: `0x${string}`): Promise<void> {
    await prisma.actionAttempt.update({
      where: { actionId },
      data: {
        status: "SETTLED",
        paymentSettlement: {
          upsert: {
            create: {
              payer: "unknown",
              recipient: "unknown",
              amount: "0",
              asset: "unknown",
              settlementRef,
              txHash,
              verificationMode: "pending",
            },
            update: {
              settlementRef,
              txHash,
            },
          },
        },
      },
    });
  }
}

export class PrismaNonceStore implements NonceStore {
  async use(sessionAddress: `0x${string}`, nonce: string): Promise<boolean> {
    try {
      await prisma.nonce.create({
        data: {
          sessionAddress: sessionAddress.toLowerCase(),
          nonce,
        },
      });
      return true;
    } catch {
      return false;
    }
  }
}

export class PrismaBudgetService implements BudgetService {
  async canSpend(agentAddress: `0x${string}`, perCallCostAtomic: bigint, dailyCapAtomic: bigint): Promise<boolean> {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const rows = (await prisma.paymentSettlement.findMany({
      where: {
        payer: agentAddress.toLowerCase(),
        verifiedAt: {
          gte: dayStart,
        },
      },
      select: {
        amount: true,
      },
    })) as Array<{ amount: { toString: () => string } }>;

    const spent = rows.reduce((acc: bigint, row) => acc + BigInt(row.amount.toString()), 0n);
    return spent + perCallCostAtomic <= dailyCapAtomic;
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  async allow(key: string, maxPerMin: number): Promise<boolean> {
    const now = Date.now();
    const current = this.windows.get(key);

    if (!current || current.resetAt < now) {
      this.windows.set(key, {
        count: 1,
        resetAt: now + 60_000,
      });
      return true;
    }

    if (current.count >= maxPerMin) {
      return false;
    }

    current.count += 1;
    return true;
  }
}

export class PrismaEventSink implements EventSink {
  async write(event: EnforcementEvent): Promise<void> {
    const action = await ensureActionAttempt(event.actionId, event.agentAddress, event.routeId);

    await prisma.enforcementEvent.create({
      data: {
        actionAttemptId: action.id,
        actionId: event.actionId,
        agentAddress: event.agentAddress.toLowerCase(),
        routeId: event.routeId,
        eventType: event.eventType,
        detailsJson: event.details,
        createdAt: new Date(event.createdAt),
      },
    });
  }
}

export class PrismaReceiptWriter implements ReceiptWriter {
  constructor(private readonly onchain: OnchainReceiptWriter) {}

  async record(input: {
    actionId: string;
    agent: `0x${string}`;
    payer: `0x${string}`;
    amountAtomic: string;
    asset: `0x${string}`;
    routeId: string;
    paymentRef: string;
    metadataHash: string;
    txHash?: `0x${string}`;
  }): Promise<{ onchainTxHash?: `0x${string}`; onchainReceiptId?: string }> {
    const onchain = await this.onchain.recordOnchain({
      actionId: input.actionId,
      agent: input.agent,
      payer: input.payer,
      amountAtomic: input.amountAtomic,
      asset: input.asset,
      routeId: input.routeId,
      paymentRef: input.paymentRef,
      metadataHash: input.metadataHash,
    });

    const agent = await ensureAgent(input.agent);
    await ensureActionAttempt(input.actionId, input.agent, input.routeId);

    await prisma.receipt.create({
      data: {
        actionId: input.actionId,
        agentId: agent.id,
        payer: input.payer.toLowerCase(),
        asset: input.asset.toLowerCase(),
        amount: input.amountAtomic,
        routeId: input.routeId,
        paymentRef: input.paymentRef,
        metadataHash: input.metadataHash,
        onchainTxHash: onchain.txHash,
        onchainReceiptId: onchain.receiptId,
      },
    });

    await prisma.paymentSettlement.updateMany({
      where: {
        actionAttempt: { is: { actionId: input.actionId } },
      },
      data: {
        payer: input.payer.toLowerCase(),
        recipient: input.agent.toLowerCase(),
        amount: input.amountAtomic,
        asset: input.asset.toLowerCase(),
        settlementRef: input.paymentRef,
        txHash: input.txHash,
        verificationMode: input.txHash ? "direct" : "facilitator",
      },
    });

    return {
      onchainTxHash: onchain.txHash,
      onchainReceiptId: onchain.receiptId,
    };
  }
}
