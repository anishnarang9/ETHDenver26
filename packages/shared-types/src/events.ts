export type EnforcementEventType =
  | "IDENTITY_VERIFIED"
  | "SESSION_VERIFIED"
  | "PASSPORT_VERIFIED"
  | "SCOPE_VERIFIED"
  | "SERVICE_VERIFIED"
  | "RATE_LIMIT_VERIFIED"
  | "BUDGET_VERIFIED"
  | "QUOTE_ISSUED"
  | "PAYMENT_VERIFIED"
  | "RECEIPT_RECORDED"
  | "RESPONSE_SERVED"
  | "REQUEST_BLOCKED";

export interface EnforcementEvent {
  actionId: string;
  agentAddress: `0x${string}`;
  routeId: string;
  eventType: EnforcementEventType;
  details: Record<string, string | number | boolean | null>;
  createdAt: string;
}
