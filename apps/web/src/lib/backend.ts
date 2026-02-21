export type PlannerRun = {
  runId: string;
  _count?: { id?: number };
  _max?: { offsetMs?: number | null };
};

export type PlannerRunsResponse = { runs: PlannerRun[] };

export type PlannerStreamEvent = {
  type: string;
  agentId?: string;
  payload?: Record<string, unknown>;
  runId?: string;
  offsetMs?: number;
};

export type GatewayTimelineEvent = {
  id: string;
  actionId: string;
  agentAddress: string;
  routeId: string;
  eventType: string;
  detailsJson: Record<string, unknown>;
  createdAt: string;
};

export type GatewayTimelineResponse = {
  events: GatewayTimelineEvent[];
};

export type PassportResponse = {
  onchain: {
    revoked?: boolean;
    expiresAt?: number | string;
    perCallCap?: string;
    dailyCap?: string;
    scopes?: string[];
    services?: string[];
  };
  latestSnapshot: {
    revoked: boolean;
    expiresAt: string;
    perCallCap: string;
    dailyCap: string;
    scopes: unknown;
    services: unknown;
  } | null;
};

export const plannerBaseUrl =
  process.env.NEXT_PUBLIC_PLANNER_URL?.replace(/\/$/, "") || "http://localhost:4005";
export const gatewayBaseUrl =
  process.env.NEXT_PUBLIC_GATEWAY_URL?.replace(/\/$/, "") || "http://localhost:4001";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${url}`);
  }
  return (await res.json()) as T;
}

export async function getPlannerRuns(): Promise<PlannerRun[]> {
  try {
    const data = await fetchJson<PlannerRunsResponse>(`${plannerBaseUrl}/api/runs`);
    return data.runs ?? [];
  } catch {
    return [];
  }
}

export async function getGatewayTimeline(agentAddress: string): Promise<GatewayTimelineEvent[]> {
  if (!agentAddress) return [];
  try {
    const data = await fetchJson<GatewayTimelineResponse>(`${gatewayBaseUrl}/api/timeline/${agentAddress}`);
    return data.events ?? [];
  } catch {
    return [];
  }
}

export async function getPassport(agentAddress: string): Promise<PassportResponse | null> {
  if (!agentAddress) return null;
  try {
    return await fetchJson<PassportResponse>(`${gatewayBaseUrl}/api/passport/${agentAddress}`);
  } catch {
    return null;
  }
}

export function getConfiguredAgentAddresses(): string[] {
  const raw = process.env.NEXT_PUBLIC_AGENT_ADDRESSES || "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}
