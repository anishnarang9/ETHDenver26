import { randomBytes, randomUUID } from "node:crypto";
import type {
  BudgetService,
  EventSink,
  NonceStore,
  PassportClient,
  PassportView,
  QuoteStore,
  RateLimiter,
  ReceiptWriter,
  SessionClient,
  SessionView,
} from "./types.js";
import type { EnforcementEvent, PaymentChallenge } from "@kite-stack/shared-types";

export class InMemoryPassportClient implements PassportClient {
  private readonly passports = new Map<string, PassportView>();

  constructor(seed?: PassportView[]) {
    for (const row of seed ?? []) {
      this.passports.set(row.agent.toLowerCase(), row);
    }
  }

  upsert(passport: PassportView) {
    this.passports.set(passport.agent.toLowerCase(), passport);
  }

  async getPassport(agent: `0x${string}`): Promise<PassportView | null> {
    return this.passports.get(agent.toLowerCase()) ?? null;
  }

  async isScopeAllowed(agent: `0x${string}`, scope: string): Promise<boolean> {
    const item = this.passports.get(agent.toLowerCase());
    return !!item?.scopes.includes(scope);
  }

  async isServiceAllowed(agent: `0x${string}`, service: string): Promise<boolean> {
    const item = this.passports.get(agent.toLowerCase());
    return !!item?.services.includes(service);
  }
}

export class InMemorySessionClient implements SessionClient {
  private readonly sessions = new Map<string, SessionView>();

  constructor(seed?: SessionView[]) {
    for (const row of seed ?? []) {
      this.sessions.set(row.session.toLowerCase(), row);
    }
  }

  upsert(session: SessionView) {
    this.sessions.set(session.session.toLowerCase(), session);
  }

  async getSession(session: `0x${string}`): Promise<SessionView | null> {
    return this.sessions.get(session.toLowerCase()) ?? null;
  }

  async isSessionActive(session: `0x${string}`): Promise<boolean> {
    const row = this.sessions.get(session.toLowerCase());
    return !!row && !row.revoked && row.expiresAt > Math.floor(Date.now() / 1000);
  }

  async hasScope(session: `0x${string}`, scope: string): Promise<boolean> {
    const row = this.sessions.get(session.toLowerCase());
    if (!row) {
      return false;
    }
    if (row.scopes.length === 0) {
      return true;
    }
    return row.scopes.includes(scope);
  }
}

export class InMemoryQuoteStore implements QuoteStore {
  private readonly quotes = new Map<string, PaymentChallenge>();

  async get(actionId: string): Promise<PaymentChallenge | null> {
    return this.quotes.get(actionId) ?? null;
  }

  async save(
    actionId: string,
    challenge: PaymentChallenge,
    _routeId: string,
    _agent: `0x${string}`
  ): Promise<void> {
    this.quotes.set(actionId, challenge);
  }

  async markSettled(actionId: string, _settlementRef: string, _txHash?: `0x${string}`): Promise<void> {
    this.quotes.delete(actionId);
  }
}

export class InMemoryNonceStore implements NonceStore {
  private readonly nonces = new Set<string>();

  async use(sessionAddress: `0x${string}`, nonce: string): Promise<boolean> {
    const key = `${sessionAddress.toLowerCase()}:${nonce}`;
    if (this.nonces.has(key)) {
      return false;
    }
    this.nonces.add(key);
    return true;
  }
}

export class InMemoryBudgetService implements BudgetService {
  private readonly spends = new Map<string, bigint>();

  async canSpend(agentAddress: `0x${string}`, perCallCostAtomic: bigint, dailyCapAtomic: bigint): Promise<boolean> {
    if (perCallCostAtomic > dailyCapAtomic) {
      return false;
    }

    const existing = this.spends.get(agentAddress.toLowerCase()) ?? 0n;
    return existing + perCallCostAtomic <= dailyCapAtomic;
  }
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  async allow(key: string, maxPerMin: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.windows.get(key);

    if (!existing || existing.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + 60_000 });
      return true;
    }

    if (existing.count >= maxPerMin) {
      return false;
    }

    existing.count += 1;
    return true;
  }
}

export class InMemoryReceiptWriter implements ReceiptWriter {
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
    return {
      onchainReceiptId: `rcpt_${input.actionId}`,
      onchainTxHash: (input.txHash ?? (`0x${randomBytes(32).toString("hex")}` as `0x${string}`)),
    };
  }
}

export class InMemoryEventSink implements EventSink {
  public readonly events: EnforcementEvent[] = [];

  async write(event: EnforcementEvent): Promise<void> {
    this.events.push(event);
  }
}
