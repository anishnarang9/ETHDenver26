export type StatusTone = "success" | "warning" | "danger" | "info";

export const missionSummary = {
  missionId: "M-2026-0217-DEN",
  status: "ACTIVE",
  spendToday: "4.7 KITE",
  healthScore: 92,
  activeAgents: 5,
  pendingPayments: 2,
};

export const metricCards = [
  { label: "Budget Remaining", value: "5.3 KITE", delta: "+1.2", tone: "success" as StatusTone },
  { label: "Pending Payments", value: "2", delta: "-1", tone: "warning" as StatusTone },
  { label: "Blocked Requests", value: "4", delta: "+2", tone: "danger" as StatusTone },
  { label: "Pass Rate (24h)", value: "96.1%", delta: "+0.8%", tone: "info" as StatusTone },
];

export const timelineEvents = [
  { time: "14:02:55", title: "PAYMENT_VERIFIED", detail: "Planner paid Rider 0.5 KITE", tone: "success" as StatusTone },
  { time: "14:01:20", title: "SCOPE_CHECK", detail: "eventbot scope=events passed", tone: "info" as StatusTone },
  { time: "13:59:09", title: "DAILY_BUDGET_WARNING", detail: "Planner hit 88% daily limit", tone: "warning" as StatusTone },
  { time: "13:58:12", title: "PASSPORT_REVOKED", detail: "foodie passport revoked by owner", tone: "danger" as StatusTone },
];

export const transactions = [
  { id: "0x87...e91c", agent: "planner", counterparty: "rider", amount: "0.5 KITE", status: "Verified", at: "2026-02-21 14:02:55" },
  { id: "0x44...2ab0", agent: "planner", counterparty: "foodie", amount: "1.0 KITE", status: "Pending", at: "2026-02-21 13:55:20" },
  { id: "0x91...bc01", agent: "planner", counterparty: "eventbot", amount: "0.5 KITE", status: "Failed", at: "2026-02-21 13:51:12" },
];

export const agents = [
  { name: "Planner", role: "Orchestrator", state: "Healthy", balance: "6.4 KITE", scopes: ["hire", "email", "weather"] },
  { name: "Rider", role: "Transport", state: "Healthy", balance: "2.1 KITE", scopes: ["rides", "maps"] },
  { name: "Foodie", role: "Restaurants", state: "Revoked", balance: "0.4 KITE", scopes: ["restaurants", "maps"] },
  { name: "EventBot", role: "Events", state: "Warning", balance: "1.0 KITE", scopes: ["events", "booking"] },
  { name: "Weather", role: "Provider", state: "Healthy", balance: "n/a", scopes: ["weather"] },
];

export const enforcementSteps = [
  "01 Identity",
  "02 Nonce",
  "03 Session",
  "04 Passport",
  "05 Scope",
  "06 Service",
  "07 Rate Limit",
  "08 Budget",
  "09 Quote",
  "10 Payment",
];

export const missionRuns = [
  { id: "RUN-372", status: "Completed", duration: "4m 22s", spend: "2.5 KITE", date: "2026-02-21 13:55" },
  { id: "RUN-371", status: "Failed @ Step 8", duration: "2m 11s", spend: "4.9 KITE", date: "2026-02-21 13:23" },
  { id: "RUN-370", status: "Completed", duration: "5m 40s", spend: "3.0 KITE", date: "2026-02-21 12:47" },
];

export const paymentFunnel = [
  { label: "Challenged", value: 38 },
  { label: "Paid", value: 34 },
  { label: "Verified", value: 31 },
  { label: "Failed", value: 3 },
];
