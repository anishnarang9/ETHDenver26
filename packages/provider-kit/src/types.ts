import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  DirectTransferVerificationResult,
  EnforcementEvent,
  PaymentChallenge,
  PaymentProof,
  RoutePolicy,
  SignedRequestEnvelope,
} from "@kite-stack/shared-types";

export interface PassportView {
  owner: `0x${string}`;
  agent: `0x${string}`;
  expiresAt: number;
  perCallCap: bigint;
  dailyCap: bigint;
  rateLimitPerMin: number;
  revoked: boolean;
  scopes: string[];
  services: string[];
}

export interface SessionView {
  owner: `0x${string}`;
  agent: `0x${string}`;
  session: `0x${string}`;
  expiresAt: number;
  revoked: boolean;
  scopes: string[];
}

export interface PassportClient {
  getPassport(agent: `0x${string}`): Promise<PassportView | null>;
  isScopeAllowed(agent: `0x${string}`, scope: string): Promise<boolean>;
  isServiceAllowed(agent: `0x${string}`, service: string): Promise<boolean>;
}

export interface SessionClient {
  getSession(session: `0x${string}`): Promise<SessionView | null>;
  isSessionActive(session: `0x${string}`): Promise<boolean>;
  hasScope(session: `0x${string}`, scope: string): Promise<boolean>;
}

export interface QuoteStore {
  get(actionId: string): Promise<PaymentChallenge | null>;
  save(actionId: string, challenge: PaymentChallenge, routeId: string, agent: `0x${string}`): Promise<void>;
  markSettled(actionId: string, settlementRef: string, txHash?: `0x${string}`): Promise<void>;
}

export interface PaymentVerifyInput {
  challenge: PaymentChallenge;
  proof: PaymentProof;
  agentAddress: `0x${string}`;
}

export interface PaymentVerification {
  verified: boolean;
  settlementRef: string;
  txHash?: `0x${string}`;
  payer: `0x${string}`;
  amountAtomic: string;
  mode: "facilitator" | "direct";
  reason?: string;
  directResult?: DirectTransferVerificationResult;
}

export interface PaymentService {
  buildQuote(input: {
    actionId: string;
    routePolicy: RoutePolicy;
    payTo: `0x${string}`;
    asset: `0x${string}`;
  }): Promise<PaymentChallenge>;
  verifyPayment(input: PaymentVerifyInput): Promise<PaymentVerification>;
}

export interface NonceStore {
  use(sessionAddress: `0x${string}`, nonce: string): Promise<boolean>;
}

export interface BudgetService {
  canSpend(agentAddress: `0x${string}`, perCallCostAtomic: bigint, dailyCapAtomic: bigint): Promise<boolean>;
}

export interface RateLimiter {
  allow(key: string, maxPerMin: number): Promise<boolean>;
}

export interface ReceiptWriter {
  record(input: {
    actionId: string;
    agent: `0x${string}`;
    payer: `0x${string}`;
    amountAtomic: string;
    asset: `0x${string}`;
    routeId: string;
    paymentRef: string;
    metadataHash: string;
    txHash?: `0x${string}`;
  }): Promise<{ onchainTxHash?: `0x${string}`; onchainReceiptId?: string }>;
}

export interface EventSink {
  write(event: EnforcementEvent): Promise<void>;
}

export interface SignatureVerifier {
  verify(envelope: SignedRequestEnvelope, request: FastifyRequest): Promise<boolean>;
}

export interface EnforcementContext {
  actionId: string;
  routePolicy: RoutePolicy;
  challenge?: PaymentChallenge;
}

export interface EnforcementOptions {
  routePolicies: Record<string, RoutePolicy>;
  defaultPayTo: `0x${string}`;
  defaultAsset: `0x${string}`;
  facilitatorUrl: string;
  passportClient: PassportClient;
  sessionClient: SessionClient;
  quoteStore: QuoteStore;
  paymentService: PaymentService;
  nonceStore: NonceStore;
  budgetService: BudgetService;
  rateLimiter: RateLimiter;
  receiptWriter: ReceiptWriter;
  eventSink: EventSink;
  signatureVerifier: SignatureVerifier;
  routeIdResolver?: (request: FastifyRequest) => string;
  now?: () => Date;
}

export interface RouteEnforcer {
  (request: FastifyRequest, reply: FastifyReply): Promise<void>;
}

declare module "fastify" {
  interface FastifyRequest {
    enforcementContext?: EnforcementContext;
  }
}
