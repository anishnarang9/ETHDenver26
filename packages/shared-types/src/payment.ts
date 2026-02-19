export type ScopeKey = "enrich.wallet" | "premium.intel";
export type ServiceKey = "internal.enrich" | "external.premium";

export interface RoutePolicy {
  routeId: string;
  scope: ScopeKey;
  service: ServiceKey;
  priceAtomic: string;
  rateLimitPerMin: number;
  requirePayment: boolean;
}

export interface PaymentChallenge {
  actionId: string;
  routeId: string;
  asset: `0x${string}`;
  amountAtomic: string;
  payTo: `0x${string}`;
  expiresAt: string;
  facilitatorUrl: string;
  protocolMode: "dual";
}

export interface PaymentProof {
  actionId: string;
  txHash?: `0x${string}`;
  signature?: string;
  protocol: "x-payment" | "payment-signature" | "direct-transfer";
  settlementRef?: string;
}

export interface FacilitatorSettlementResult {
  verified: boolean;
  settlementRef?: string;
  txHash?: `0x${string}`;
  reason?: string;
}

export interface DirectTransferVerificationResult {
  verified: boolean;
  txHash?: `0x${string}`;
  amountAtomic?: string;
  payer?: `0x${string}`;
  reason?: string;
}

export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";
export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
export const X_PAYMENT_HEADER = "X-PAYMENT";
export const X_PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE";
export const X_TX_HASH_HEADER = "X-TX-HASH";
export const X_ACTION_ID_HEADER = "X-ACTION-ID";
