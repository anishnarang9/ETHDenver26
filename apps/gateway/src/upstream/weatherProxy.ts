import { proxyX402Request } from "./x402Proxy.js";

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

export const proxyWeatherRequest = async (options: WeatherProxyOptions): Promise<WeatherProxyResult> => {
  return proxyX402Request({
    upstreamUrl: options.upstreamUrl,
    method: "GET",
    query: { location: options.location },
    requestHeaders: options.requestHeaders,
    gatewayActionId: options.gatewayActionId,
    timeoutMs: options.timeoutMs,
  });
};
