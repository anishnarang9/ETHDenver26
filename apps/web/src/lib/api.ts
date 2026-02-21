export const gatewayBase = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:4001";

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

export const getTimeline = async (agent: string) => {
  const response = await fetch(`${gatewayBase}/api/timeline/${agent}`, { cache: "no-store" });
  return unwrap<{
    events: Array<{
      id: string;
      actionId: string;
      routeId: string;
      eventType: string;
      detailsJson: Record<string, unknown>;
      createdAt: string;
    }>;
  }>(response);
};

export const getAction = async (actionId: string) => {
  const response = await fetch(`${gatewayBase}/api/actions/${actionId}`, { cache: "no-store" });
  return unwrap<Record<string, unknown>>(response);
};

export const getPassport = async (agent: string) => {
  const response = await fetch(`${gatewayBase}/api/passport/${agent}`, { cache: "no-store" });
  return unwrap<Record<string, unknown>>(response);
};
