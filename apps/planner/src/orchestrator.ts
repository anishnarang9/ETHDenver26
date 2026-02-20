import { JsonRpcProvider, Wallet } from "ethers";
import { runAgentLoop, type SSEHub } from "@kite-stack/agent-core";
import type { PlannerEnv } from "./config.js";
import { createWeatherTool } from "./tools/weather.js";
import { createHireRiderTool, createHireFoodieTool, createHireEventBotTool, createRegisterEventTool } from "./tools/hire.js";
import { createEmailTools } from "./tools/email.js";

export async function runTripPlan(opts: {
  humanEmail: { from: string; subject: string; body: string };
  sseHub: SSEHub;
  config: PlannerEnv;
}): Promise<void> {
  const provider = new JsonRpcProvider(opts.config.KITE_RPC_URL);
  const agentWallet = new Wallet(opts.config.PLANNER_AGENT_PRIVATE_KEY, provider);
  const sessionWallet = new Wallet(opts.config.PLANNER_SESSION_PRIVATE_KEY, provider);
  const paymentWallet = new Wallet(opts.config.PLANNER_PAYMENT_PRIVATE_KEY, provider);

  const hireCtx = {
    provider,
    agentWallet,
    sessionWallet,
    paymentWallet,
    paymentAsset: opts.config.PAYMENT_ASSET,
    sseHub: opts.sseHub,
  };

  opts.sseHub.emit({ type: "email_received", agentId: "planner", payload: { from: opts.humanEmail.from, subject: opts.humanEmail.subject, body: opts.humanEmail.body } });

  const weatherTool = createWeatherTool({
    weatherUrl: opts.config.KITE_WEATHER_URL,
    facilitatorUrl: opts.config.FACILITATOR_URL,
    sseHub: opts.sseHub,
  });

  const emailTools = createEmailTools({
    agentMailApiKey: opts.config.AGENTMAIL_API_KEY,
    sseHub: opts.sseHub,
  });

  const tools = [
    weatherTool,
    createHireRiderTool(hireCtx, opts.config.RIDER_URL),
    createHireFoodieTool(hireCtx, opts.config.FOODIE_URL),
    createHireEventBotTool(hireCtx, opts.config.EVENTBOT_URL),
    createRegisterEventTool(hireCtx, opts.config.EVENTBOT_URL),
    ...emailTools,
  ];

  const result = await runAgentLoop({
    model: "gpt-4o",
    systemPrompt: `You are TripDesk Planner, an AI travel concierge orchestrating a team of specialist agents.

You received an email from a human requesting trip planning help. Use your tools to:
1. First check the weather at the destination (get_weather)
2. Then hire specialists IN PARALLEL if possible:
   - hire_rider: Find transportation options
   - hire_foodie: Find restaurant recommendations (pass weather info for indoor/outdoor preference)
   - hire_eventbot: Find events matching interests
3. For promising events, use register_event to sign up
4. Compile all results into a beautiful itinerary
5. Send the itinerary to the human via email_human

Be efficient with tool calls. Explain your reasoning as you go.
When compiling the itinerary, include a cost breakdown of all x402 payments made.`,
    userMessage: `New trip planning request:\n\nFrom: ${opts.humanEmail.from}\nSubject: ${opts.humanEmail.subject}\n\n${opts.humanEmail.body}`,
    tools,
    onThought: (text) => {
      opts.sseHub.emit({ type: "llm_thinking", agentId: "planner", payload: { text } });
    },
    onToolCall: (name, args) => {
      opts.sseHub.emit({ type: "llm_tool_call", agentId: "planner", payload: { tool: name, args } });
    },
    apiKey: opts.config.OPENAI_API_KEY,
    maxIterations: 20,
  });

  opts.sseHub.emit({ type: "agent_status", agentId: "planner", payload: { status: "completed", finalAnswer: result.finalAnswer } });
}
