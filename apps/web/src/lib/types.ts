export type AgentId = string;

export interface EmailEvent {
  id: string;
  from: string;
  to?: string;
  subject: string;
  body: string;
  timestamp: string;
  agentId: AgentId | "human";
}

export interface BrowserPanelState {
  agentId: string;
  liveViewUrl?: string;
  status: "standby" | "active" | "closed" | "revoked";
  sessionId?: string;
}

export interface EnforcementStep {
  step: number;
  name: string;
  status: "pending" | "pass" | "fail";
  detail?: string;
}

export interface TransactionEvent {
  id: string;
  from: string;
  to: string;
  amount: string;
  method: string;
  txHash?: string;
  status: "pending" | "complete" | "failed";
  timestamp: string;
}

export interface SSEMessage {
  type: string;
  agentId: string;
  payload: Record<string, unknown>;
  runId?: string;
  offsetMs?: number;
}

export interface SpawnedAgentInfo {
  id: string;
  role: string;
  address?: string;
  status: string;
  needsBrowser?: boolean;
  step?: string;
  inboxAddress?: string;
  fundingTxHash?: string;
  passportTxHash?: string;
  sessionTxHash?: string;
  createdAt?: string;
}

export interface AgentNode {
  id: string;
  role: string;
  status: string;
  address?: string;
  inboxAddress?: string;
}

export interface EmailEdge {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  subject?: string;
  timestamp: number;
  threadId?: string;
}

export interface TimelineEvent {
  id: string;
  actionId: string;
  routeId: string;
  eventType: string;
  detailsJson: Record<string, unknown>;
  createdAt: string;
}

export const ENFORCEMENT_SEQUENCE = [
  "IDENTITY_VERIFIED",
  "SESSION_VERIFIED",
  "PASSPORT_VERIFIED",
  "SCOPE_VERIFIED",
  "SERVICE_VERIFIED",
  "RATE_LIMIT_VERIFIED",
  "BUDGET_VERIFIED",
  "QUOTE_ISSUED",
  "PAYMENT_VERIFIED",
  "RECEIPT_RECORDED",
] as const;

export const ENFORCEMENT_LABELS: Record<string, string> = {
  IDENTITY_VERIFIED: "Identity",
  SESSION_VERIFIED: "Session",
  PASSPORT_VERIFIED: "Passport",
  SCOPE_VERIFIED: "Scope",
  SERVICE_VERIFIED: "Service",
  RATE_LIMIT_VERIFIED: "Rate",
  BUDGET_VERIFIED: "Budget",
  QUOTE_ISSUED: "Quote",
  PAYMENT_VERIFIED: "Payment",
  RECEIPT_RECORDED: "Receipt",
  REQUEST_BLOCKED: "Blocked",
};
