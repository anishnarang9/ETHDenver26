import { JsonRpcProvider, Wallet } from "ethers";
import {
  runAgentLoop,
  AgentSpawner,
  createBrowserToolsWithSession,
  type SSEHub,
  type AgentTool,
} from "@kite-stack/agent-core";
import type { PlannerEnv } from "./config.js";
import { createWeatherTool } from "./tools/weather.js";
import { createEmailTools } from "./tools/email.js";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentManifestEntry {
  role: string;
  systemPrompt: string;
  task: string;
  needsBrowser: boolean;
  scopes: string[];
}

interface AgentResult {
  agentId: string;
  role: string;
  status: "fulfilled" | "rejected";
  result?: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Main dynamic orchestrator                                          */
/* ------------------------------------------------------------------ */

export async function runDynamicTripPlan(opts: {
  humanEmail: { from: string; subject: string; body: string };
  sseHub: SSEHub;
  config: PlannerEnv;
  plannerInboxAddress?: string;
}): Promise<void> {
  const provider = new JsonRpcProvider(opts.config.KITE_RPC_URL);
  const paymentWallet = new Wallet(opts.config.PLANNER_PAYMENT_PRIVATE_KEY, provider);

  opts.sseHub.emit({
    type: "email_received",
    agentId: "planner",
    payload: { from: opts.humanEmail.from, subject: opts.humanEmail.subject, body: opts.humanEmail.body },
  });

  /* ---------------------------------------------------------------- */
  /*  Phase 1: Planning — ask LLM what agents to spawn                 */
  /* ---------------------------------------------------------------- */

  opts.sseHub.emit({
    type: "orchestrator_phase",
    agentId: "planner",
    payload: { phase: "planning", message: "Analyzing request and planning agent team..." },
  });

  let manifest: AgentManifestEntry[] = [];

  const planAgentTool: AgentTool = {
    name: "plan_agents",
    description: "Define the team of specialist agents needed for this trip. Each agent will be spawned with a real wallet, on-chain passport, and browser session.",
    parameters: {
      type: "object",
      properties: {
        agents: {
          type: "array",
          items: {
            type: "object",
            properties: {
              role: { type: "string", description: "Short kebab-case role name, e.g. 'uber-researcher', 'yelp-scout', 'luma-event-finder'" },
              systemPrompt: { type: "string", description: "System prompt for the agent describing its specialty" },
              task: { type: "string", description: "Specific task/query for this agent" },
              needsBrowser: { type: "boolean", description: "Whether this agent needs a Firecrawl browser session" },
              scopes: { type: "array", items: { type: "string" }, description: "Authorization scopes: travel, booking, search, food, events, transport" },
            },
            required: ["role", "systemPrompt", "task", "needsBrowser", "scopes"],
          },
          description: "Array of agents to spawn",
        },
      },
      required: ["agents"],
    },
    execute: async (args: Record<string, unknown>) => {
      manifest = (args.agents as AgentManifestEntry[]) || [];
      return { planned: manifest.length, agents: manifest.map((a) => a.role) };
    },
  };

  const weatherTool = createWeatherTool({
    weatherUrl: opts.config.KITE_WEATHER_URL,
    facilitatorUrl: opts.config.FACILITATOR_URL,
    sseHub: opts.sseHub,
    paymentWallet,
    provider,
    paymentAsset: opts.config.PAYMENT_ASSET,
  });

  await runAgentLoop({
    model: "gpt-5.2",
    systemPrompt: `You are TripDesk Orchestrator. Your job is to analyze a trip planning request and decide which specialist agents to spawn.

First, call get_weather to check weather at the destination.
Then, call plan_agents with a team of 2-4 specialist agents tailored to the request.

Common agent types:
- "ride-researcher": Searches for transportation/ride options (needs browser)
- "restaurant-scout": Finds restaurant recommendations (needs browser)
- "event-finder": Discovers events on lu.ma and similar platforms (needs browser)
- "itinerary-compiler": Compiles results into a formatted itinerary (no browser needed)

Each agent gets a real on-chain wallet, passport, and optional browser session. Be efficient — only spawn agents that are truly needed.`,
    userMessage: `New trip request:\n\nFrom: ${opts.humanEmail.from}\nSubject: ${opts.humanEmail.subject}\n\n${opts.humanEmail.body}`,
    tools: [weatherTool, planAgentTool],
    onThought: (text) => {
      opts.sseHub.emit({ type: "llm_thinking", agentId: "planner", payload: { text } });
    },
    onToolCall: (name, args) => {
      opts.sseHub.emit({ type: "llm_tool_call", agentId: "planner", payload: { tool: name, args } });
    },
    apiKey: opts.config.OPENAI_API_KEY,
    maxIterations: 5,
  });

  if (manifest.length === 0) {
    // Fallback: create a default set of agents
    manifest = [
      {
        role: "ride-researcher",
        systemPrompt: "You are a transportation research agent. Search for ride options from airports and between locations. Use the browser to search Google, Uber estimate sites, and transit sites. Return a JSON object with a 'rides' array containing objects with: type, provider, estimatedPrice, estimatedTime, notes.",
        task: `Find transportation options for the trip described in: ${opts.humanEmail.body}`,
        needsBrowser: true,
        scopes: ["travel", "transport", "search"],
      },
      {
        role: "restaurant-scout",
        systemPrompt: "You are a restaurant recommendation agent. Search for restaurants near the destination using the browser. Return a JSON object with a 'restaurants' array containing objects with: name, cuisine, priceRange, rating, address, notes.",
        task: `Find restaurant recommendations for: ${opts.humanEmail.body}`,
        needsBrowser: true,
        scopes: ["food", "search"],
      },
      {
        role: "event-finder",
        systemPrompt: "You are an event discovery agent specializing in tech/crypto/AI events. Search lu.ma and similar platforms. Return a JSON object with an 'events' array containing objects with: name, date, time, location, url, description, registrationOpen.",
        task: `Find relevant events for: ${opts.humanEmail.body}`,
        needsBrowser: true,
        scopes: ["events", "search"],
      },
    ];
  }

  opts.sseHub.emit({
    type: "agent_plan_created",
    agentId: "planner",
    payload: { agents: manifest.map((a) => ({ role: a.role, needsBrowser: a.needsBrowser, scopes: a.scopes })) },
  });

  /* ---------------------------------------------------------------- */
  /*  Phase 2: Spawning — create wallets, passports, sessions          */
  /* ---------------------------------------------------------------- */

  opts.sseHub.emit({
    type: "orchestrator_phase",
    agentId: "planner",
    payload: { phase: "spawning", message: `Spawning ${manifest.length} agents with on-chain identities...` },
  });

  const spawner = new AgentSpawner({
    rpcUrl: opts.config.KITE_RPC_URL,
    deployerPrivateKey: opts.config.DEPLOYER_PRIVATE_KEY,
    paymentPrivateKey: opts.config.PLANNER_PAYMENT_PRIVATE_KEY,
    passportRegistryAddress: opts.config.PASSPORT_REGISTRY_ADDRESS,
    sessionRegistryAddress: opts.config.SESSION_REGISTRY_ADDRESS,
    paymentAsset: opts.config.PAYMENT_ASSET,
    sseHub: opts.sseHub,
  });

  // Spawn all agents (sequential to avoid nonce issues, but each spawn emits SSE events)
  const spawnedMap = new Map<string, { agentId: string; role: string; entry: AgentManifestEntry }>();

  for (const entry of manifest) {
    try {
      const spawned = await spawner.spawnAgent({ role: entry.role, scopes: entry.scopes });
      spawnedMap.set(spawned.id, { agentId: spawned.id, role: entry.role, entry });
    } catch (err) {
      opts.sseHub.emit({
        type: "error",
        agentId: "planner",
        payload: { message: `Failed to spawn ${entry.role}: ${(err as Error).message}` },
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Phase 3: Execution — run all agents in parallel                  */
  /* ---------------------------------------------------------------- */

  opts.sseHub.emit({
    type: "orchestrator_phase",
    agentId: "planner",
    payload: { phase: "executing", message: `Running ${spawnedMap.size} agents in parallel...` },
  });

  const agentPromises: Promise<AgentResult>[] = [];

  for (const [agentId, { role, entry }] of spawnedMap) {
    const promise = (async (): Promise<AgentResult> => {
      let browserCleanup: (() => Promise<void>) | undefined;

      try {
        opts.sseHub.emit({ type: "agent_status", agentId, payload: { status: "active", role } });

        const tools: AgentTool[] = [];

        // Add browser tools if needed
        if (entry.needsBrowser && opts.config.FIRECRAWL_API_KEY) {
          const browserResult = await createBrowserToolsWithSession({
            firecrawlApiKey: opts.config.FIRECRAWL_API_KEY,
            agentId,
            sseHub: opts.sseHub,
          });
          tools.push(...browserResult.tools);
          browserCleanup = browserResult.cleanup;
        }

        // Add report_results tool
        let reportedResult = "";
        tools.push({
          name: "report_results",
          description: "Report your findings back to the orchestrator. Call this when done with your task.",
          parameters: {
            type: "object",
            properties: {
              results: { type: "string", description: "JSON string of your findings" },
            },
            required: ["results"],
          },
          execute: async (args: Record<string, unknown>) => {
            reportedResult = args.results as string;
            return { acknowledged: true };
          },
        });

        const result = await runAgentLoop({
          model: "gpt-5.2",
          systemPrompt: entry.systemPrompt + "\n\nIMPORTANT: When you have gathered your findings, call report_results with a JSON summary. Be thorough but efficient.",
          userMessage: entry.task,
          tools,
          onThought: (text) => {
            opts.sseHub.emit({ type: "llm_thinking", agentId, payload: { text } });
          },
          onToolCall: (name, args) => {
            opts.sseHub.emit({ type: "llm_tool_call", agentId, payload: { tool: name, args } });
          },
          apiKey: opts.config.OPENAI_API_KEY,
          maxIterations: 12,
        });

        // Cleanup browser session
        if (browserCleanup) await browserCleanup();

        const finalResult = reportedResult || result.finalAnswer;

        opts.sseHub.emit({ type: "agent_status", agentId, payload: { status: "completed", role } });

        return { agentId, role, status: "fulfilled", result: finalResult };
      } catch (err) {
        if (browserCleanup) await browserCleanup().catch(() => {});
        opts.sseHub.emit({ type: "agent_status", agentId, payload: { status: "failed", role, error: (err as Error).message } });
        return { agentId, role, status: "rejected", error: (err as Error).message };
      }
    })();

    agentPromises.push(promise);
  }

  const agentResults = await Promise.allSettled(agentPromises);
  const results: AgentResult[] = agentResults.map((r) =>
    r.status === "fulfilled" ? r.value : { agentId: "unknown", role: "unknown", status: "rejected" as const, error: (r.reason as Error).message },
  );

  opts.sseHub.emit({
    type: "agent_results",
    agentId: "planner",
    payload: { results: results.map((r) => ({ role: r.role, status: r.status, hasResult: !!r.result })) },
  });

  /* ---------------------------------------------------------------- */
  /*  Phase 4: Synthesis — compile results into itinerary              */
  /* ---------------------------------------------------------------- */

  opts.sseHub.emit({
    type: "orchestrator_phase",
    agentId: "planner",
    payload: { phase: "synthesizing", message: "Compiling agent results into final itinerary..." },
  });

  const emailTools = createEmailTools({
    agentMailApiKey: opts.config.AGENTMAIL_API_KEY,
    plannerInboxAddress: opts.plannerInboxAddress,
    sseHub: opts.sseHub,
  });

  const resultsText = results
    .map((r) => `### ${r.role} (${r.status})\n${r.result || r.error || "No results"}`)
    .join("\n\n");

  await runAgentLoop({
    model: "gpt-5.2",
    systemPrompt: `You are TripDesk Synthesizer. Compile the results from multiple specialist agents into a beautiful, well-organized travel itinerary.

The itinerary should include:
- Transportation options with prices
- Restaurant recommendations with details
- Event listings with dates/times/registration links
- Weather considerations
- A suggested day-by-day schedule if possible

Send the final itinerary to the human via email_human. Use the "From" address from the original request as the "to" recipient.
IMPORTANT: The recipient email is: ${opts.humanEmail.from}`,
    userMessage: `Original request from ${opts.humanEmail.from}:\n${opts.humanEmail.body}\n\n---\n\nAgent Results:\n\n${resultsText}`,
    tools: [...emailTools],
    onThought: (text) => {
      opts.sseHub.emit({ type: "llm_thinking", agentId: "planner", payload: { text } });
    },
    onToolCall: (name, args) => {
      opts.sseHub.emit({ type: "llm_tool_call", agentId: "planner", payload: { tool: name, args } });
    },
    apiKey: opts.config.OPENAI_API_KEY,
    maxIterations: 5,
  });

  opts.sseHub.emit({
    type: "orchestrator_phase",
    agentId: "planner",
    payload: { phase: "completed", message: "Trip planning complete!" },
  });

  opts.sseHub.emit({
    type: "agent_status",
    agentId: "planner",
    payload: { status: "completed" },
  });
}
