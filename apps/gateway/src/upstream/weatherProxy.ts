import {
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  X_ACTION_ID_HEADER,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  X_TX_HASH_HEADER,
  PAYMENT_SIGNATURE_HEADER,
} from "@kite-stack/shared-types";

const FORWARDED_PAYMENT_HEADERS = [
  X_PAYMENT_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  X_ACTION_ID_HEADER,
  X_TX_HASH_HEADER,
] as const;

const PASSTHROUGH_RESPONSE_HEADERS = [
  "content-type",
  PAYMENT_REQUIRED_HEADER.toLowerCase(),
  PAYMENT_RESPONSE_HEADER.toLowerCase(),
  X_PAYMENT_RESPONSE_HEADER.toLowerCase(),
  X_ACTION_ID_HEADER.toLowerCase(),
] as const;

interface WeatherProxyOptions {
  upstreamUrl: string;
  location: string;
  requestHeaders: Record<string, unknown>;
  gatewayActionId?: string;
  timeoutMs: number;
}

interface WeatherProxyResult {
  statusCode: number;
  responseHeaders: Record<string, string>;
  payload: unknown;
}

const asHeaderValue = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
};

const buildRequestHeaders = (input: Record<string, unknown>): Headers => {
  const headers = new Headers({
    accept: "application/json",
  });

  for (const key of FORWARDED_PAYMENT_HEADERS) {
    const value = asHeaderValue(input[key.toLowerCase()] ?? input[key]);
    if (value) {
      headers.set(key, value);
    }
  }

  return headers;
};

const collectResponseHeaders = (headers: Headers): Record<string, string> => {
  const selected: Record<string, string> = {};
  for (const key of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = headers.get(key);
    if (value) {
      selected[key] = value;
    }
  }
  return selected;
};

const withGatewayActionId = (payload: unknown, gatewayActionId?: string): unknown => {
  if (!gatewayActionId) {
    return payload;
  }

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const objectPayload = payload as Record<string, unknown>;
    if (!("actionId" in objectPayload)) {
      return {
        ...objectPayload,
        actionId: gatewayActionId,
      };
    }

    return {
      ...objectPayload,
      gatewayActionId,
    };
  }

  return {
    data: payload,
    actionId: gatewayActionId,
  };
};

const parsePayload = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? { message: text } : {};
};

const withLocationQuery = (url: string, location: string): string => {
  const target = new URL(url);
  target.searchParams.set("location", location);
  return target.toString();
};

export const proxyWeatherRequest = async (options: WeatherProxyOptions): Promise<WeatherProxyResult> => {
  const upstreamResponse = await fetch(withLocationQuery(options.upstreamUrl, options.location), {
    method: "GET",
    headers: buildRequestHeaders(options.requestHeaders),
    signal: AbortSignal.timeout(options.timeoutMs),
  });

  const payload = await parsePayload(upstreamResponse);

  return {
    statusCode: upstreamResponse.status,
    responseHeaders: collectResponseHeaders(upstreamResponse.headers),
    payload: withGatewayActionId(payload, options.gatewayActionId),
  };
};
