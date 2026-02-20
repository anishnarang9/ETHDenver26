import { settleViaPieverse, type SSEHub } from "@kite-stack/agent-core";

export function createWeatherTool(opts: {
  weatherUrl: string;
  facilitatorUrl: string;
  sseHub: SSEHub;
}) {
  return {
    name: "get_weather",
    description: "Get current weather for a location via Kite Weather API (x402 payment via Pieverse)",
    parameters: {
      type: "object",
      properties: { location: { type: "string", description: "City name or location" } },
      required: ["location"],
    },
    execute: async (args: Record<string, unknown>) => {
      const location = args.location as string;
      opts.sseHub.emit({ type: "payment_start", agentId: "planner", payload: { target: "kite-weather", location } });

      try {
        // Step 1: Call weather API - expect 402
        const firstRes = await fetch(`${opts.weatherUrl}/api/weather?location=${encodeURIComponent(location)}`);

        if (firstRes.status === 402) {
          // Step 2: Get payment requirements from 402 response
          const challengeData = await firstRes.json() as Record<string, unknown>;
          opts.sseHub.emit({ type: "payment_start", agentId: "planner", payload: { status: "402_received", challenge: challengeData } });

          // Step 3: Settle via Pieverse
          const settlement = await settleViaPieverse({
            facilitatorUrl: opts.facilitatorUrl,
            authorization: challengeData,
            signature: "",
            network: "kite-testnet",
          });

          opts.sseHub.emit({ type: "payment_complete", agentId: "planner", payload: { target: "kite-weather", txHash: settlement.txHash, method: "pieverse" } });

          // Step 4: Retry with payment proof
          const retryRes = await fetch(`${opts.weatherUrl}/api/weather?location=${encodeURIComponent(location)}`, {
            headers: { "X-Payment": settlement.txHash },
          });

          if (retryRes.ok) {
            return await retryRes.json();
          }
        }

        // If first call succeeded (no payment needed) or retry worked
        if (firstRes.ok) {
          return await firstRes.json();
        }

        // Fallback: return mock weather data
        return {
          location,
          temperature: "45°F",
          condition: "Partly Cloudy",
          humidity: "35%",
          wind: "10 mph NW",
          note: "Weather API unavailable - using estimated data for Denver in February",
        };
      } catch (err) {
        opts.sseHub.emit({ type: "payment_failed", agentId: "planner", payload: { target: "kite-weather", error: (err as Error).message } });
        return { location, temperature: "45°F", condition: "Partly Cloudy", note: "Fallback weather data" };
      }
    },
  };
}
