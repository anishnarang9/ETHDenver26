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

/* ------------------------------------------------------------------ */
/*  SSE Bridge – translates enforcement events into SSE messages       */
/* ------------------------------------------------------------------ */

/** Minimal emitter interface compatible with SSEHub (avoids hard dep on agent-core) */
export interface SSEEmitter {
  emit(event: { type: string; agentId: string; payload: Record<string, unknown> }): void;
}

/** Maps EnforcementEventType → pipeline step number (1-indexed, matching PIPELINE_LABELS) */
const EVENT_TO_STEP: Record<string, { step: number; name: string }> = {
  IDENTITY_VERIFIED:   { step: 1, name: "Passport" },
  PASSPORT_VERIFIED:   { step: 1, name: "Passport" },
  SESSION_VERIFIED:    { step: 2, name: "Session" },
  SCOPE_VERIFIED:      { step: 3, name: "Scope" },
  SERVICE_VERIFIED:    { step: 4, name: "Service" },
  RATE_LIMIT_VERIFIED: { step: 9, name: "Rate" },
  BUDGET_VERIFIED:     { step: 8, name: "Budget" },
  QUOTE_ISSUED:        { step: 6, name: "Quote" },
  PAYMENT_VERIFIED:    { step: 7, name: "Payment" },
  RECEIPT_RECORDED:    { step: 10, name: "Receipt" },
};

/**
 * EventSink that bridges enforcement events into `enforcement_step` SSE events.
 * Each step is emitted at most once (deduped by step number).
 */
export class SSEBridgeEventSink implements EventSink {
  private seen = new Set<number>();

  constructor(
    private hub: SSEEmitter,
    private agentId = "enforcer",
  ) {}

  async write(event: EnforcementEvent): Promise<void> {
    // Handle REQUEST_BLOCKED as a fail on an appropriate step
    if (event.eventType === "REQUEST_BLOCKED") {
      const detail = event.details?.["reason"] ?? event.details?.["step"] ?? "blocked";
      this.hub.emit({
        type: "enforcement_step",
        agentId: this.agentId,
        payload: { step: 0, name: "Blocked", status: "fail", detail: String(detail) },
      });
      return;
    }

    const mapping = EVENT_TO_STEP[event.eventType];
    if (!mapping || this.seen.has(mapping.step)) return;
    this.seen.add(mapping.step);

    this.hub.emit({
      type: "enforcement_step",
      agentId: this.agentId,
      payload: {
        step: mapping.step,
        name: mapping.name,
        status: "pass",
        detail: `${event.eventType} (${event.routeId})`,
      },
    });

    // Nonce (step 5) is checked between identity and session –
    // emit it automatically after IDENTITY_VERIFIED
    if (event.eventType === "IDENTITY_VERIFIED" && !this.seen.has(5)) {
      this.seen.add(5);
      this.hub.emit({
        type: "enforcement_step",
        agentId: this.agentId,
        payload: { step: 5, name: "Nonce", status: "pass", detail: "Nonce accepted" },
      });
    }
  }
}
