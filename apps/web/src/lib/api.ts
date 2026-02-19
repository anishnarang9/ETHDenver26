export const gatewayBase = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4001";

export interface PassportFormInput {
  ownerPrivateKey: string;
  agentAddress: string;
  expiresAt: number;
  perCallCap: string;
  dailyCap: string;
  rateLimitPerMin: number;
  scopes: string[];
  services: string[];
}

export const upsertPassport = async (input: PassportFormInput) => {
  const response = await fetch(`${gatewayBase}/api/passport/upsert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<{ txHash: string; explorerLink: string | null }>;
};

export const revokePassport = async (input: { ownerPrivateKey: string; agentAddress: string }) => {
  const response = await fetch(`${gatewayBase}/api/passport/revoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<{ txHash: string }>;
};

export const grantSession = async (input: {
  ownerPrivateKey: string;
  agentAddress: string;
  sessionAddress: string;
  expiresAt: number;
  scopes: string[];
}) => {
  const response = await fetch(`${gatewayBase}/api/session/grant`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<{ txHash: string }>;
};

export const getTimeline = async (agent: string) => {
  const response = await fetch(`${gatewayBase}/api/timeline/${agent}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<{
    events: Array<{
      id: string;
      actionId: string;
      routeId: string;
      eventType: string;
      detailsJson: Record<string, unknown>;
      createdAt: string;
    }>;
  }>;
};

export const getAction = async (actionId: string) => {
  const response = await fetch(`${gatewayBase}/api/actions/${actionId}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<Record<string, unknown>>;
};

export const getPassport = async (agent: string) => {
  const response = await fetch(`${gatewayBase}/api/passport/${agent}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<Record<string, unknown>>;
};
