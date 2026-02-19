export type PolicyFailureReason =
  | "INVALID_SIGNATURE"
  | "SESSION_REVOKED"
  | "SESSION_EXPIRED"
  | "PASSPORT_REVOKED"
  | "PASSPORT_EXPIRED"
  | "SCOPE_FORBIDDEN"
  | "SERVICE_FORBIDDEN"
  | "RATE_LIMITED"
  | "DAILY_BUDGET_EXCEEDED"
  | "PER_CALL_BUDGET_EXCEEDED"
  | "REPLAY_NONCE"
  | "PAYMENT_REQUIRED"
  | "PAYMENT_INVALID"
  | "PAYMENT_EXPIRED";

export interface EnforcementErrorPayload {
  code: PolicyFailureReason;
  message: string;
  actionId?: string;
  routeId?: string;
}
