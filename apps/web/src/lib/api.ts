export const gatewayBase = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4001";

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
