import { JsonRpcProvider, Wallet } from "ethers";
import {
  runAgentLoop,
  AgentSpawner,
  createBrowserToolsWithSession,
  createAgentMailClient,
  type AgentMailClient,
  type SSEHub,
  type AgentTool,
} from "@kite-stack/agent-core";
import type { PlannerEnv } from "./config.js";
import { createWeatherTool } from "./tools/weather.js";
import { createAgentEmailTools, createOrchestratorEmailTools } from "./tools/email.js";

/* ------------------------------------------------------------------ */
/*  InboxPool: manages dynamic inboxes within AgentMail's 10-limit    */
/* ------------------------------------------------------------------ */

class InboxPool {
  private mailClient: AgentMailClient;
  private apiKey: string;
  private allocated = new Map<string, string>();

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.mailClient = createAgentMailClient(apiKey);
  }

  async allocate(agentId: string, roleName: string): Promise<string | null> {
    try {
      const res = await fetch("https://api.agentmail.to/v0/inboxes", {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { inboxes: Array<{ inbox_id: string }> };
        const existingAddresses = data.inboxes.map((i) => i.inbox_id);
        const usedAddresses = new Set(this.allocated.values());
        const available = existingAddresses.find(
          (addr) => !usedAddresses.has(addr) && addr.includes("td-"),
        );
        if (available) {
          this.allocated.set(agentId, available);
          return available;
        }
      }
    } catch {
      /* fall through to create */
    }

    const suffix = agentId.slice(-4);
    const username = "td-" + roleName + "-" + suffix;
    try {
      const inbox = await this.mailClient.createInbox(username);
      this.allocated.set(agentId, inbox.address);
      return inbox.address;
    } catch (err) {
      console.warn("[inbox-pool] Failed to create inbox for " + agentId + ":", (err as Error).message);
      return null;
    }
  }

  getClient(): AgentMailClient {
    return this.mailClient;
  }

  getAddress(agentId: string): string | undefined {
    return this.allocated.get(agentId);
  }
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RunningAgent {
  id: string;
  role: string;
  inboxAddress: string | null;
  status: "running" | "completed" | "failed";
  promise: Promise<string>;
}

/* ------------------------------------------------------------------ */
/*  Main email-chain orchestrator                                      */
/* ------------------------------------------------------------------ */

export async function runEmailChainTripPlan(opts: {
  humanEmail: { from: string; subject: string; body: string };
  sseHub: SSEHub;
  config: PlannerEnv;
  plannerInboxAddress?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const provider = new JsonRpcProvider(opts.config.KITE_RPC_URL);
  const paymentWallet = new Wallet(opts.config.PLANNER_PAYMENT_PRIVATE_KEY, provider);

  const inboxPool = opts.config.AGENTMAIL_API_KEY
    ? new InboxPool(opts.config.AGENTMAIL_API_KEY)
    : null;

  const spawner = new AgentSpawner({
    rpcUrl: opts.config.KITE_RPC_URL,
    deployerPrivateKey: opts.config.DEPLOYER_PRIVATE_KEY,
    paymentPrivateKey: opts.config.PLANNER_PAYMENT_PRIVATE_KEY,
    passportRegistryAddress: opts.config.PASSPORT_REGISTRY_ADDRESS,
    sessionRegistryAddress: opts.config.SESSION_REGISTRY_ADDRESS,
    paymentAsset: opts.config.PAYMENT_ASSET,
    sseHub: opts.sseHub,
  });

  const runningAgents = new Map<string, RunningAgent>();
  const agentDirectory: Record<string, string> = {};
  if (opts.plannerInboxAddress) {
    agentDirectory["orchestrator"] = opts.plannerInboxAddress;
  }

  opts.sseHub.emit({
    type: "email_received",
    agentId: "planner",
    payload: {
      from: opts.humanEmail.from,
      subject: opts.humanEmail.subject,
      body: opts.humanEmail.body,
    },
  });

  function buildDirectoryString(): string {
    return Object.entries(agentDirectory)
      .map(([role, addr]) => "  - " + role + ": " + addr)
      .join("\n");
  }

  /* ---------------------------------------------------------------- */
  /*  spawn_agent tool                                                 */
  /* ---------------------------------------------------------------- */

  const spawnAgentTool: AgentTool = {
    name: "spawn_agent",
    description:
      "Spawn a specialist agent with on-chain identity and email inbox. The agent runs autonomously and emails results back. Agents can also email each other for coordination.",
    parameters: {
      type: "object",
      properties: {
        role: { type: "string", description: "Short kebab-case role, e.g. 'ride-researcher'" },
        systemPrompt: { type: "string", description: "System prompt for the agent" },
        task: { type: "string", description: "Task description for the agent" },
        needsBrowser: { type: "boolean", description: "Whether agent needs Firecrawl browser" },
        scopes: {
          type: "array",
          items: { type: "string" },
          description: "Authorization scopes",
        },
        emailTo: {
          type: "string",
          description: "Optional: primary email to send results to (defaults to orchestrator)",
        },
        collaborateWith: {
          type: "array",
          items: { type: "string" },
          description: "Optional: list of agent roles this agent should coordinate with via email",
        },
      },
      required: ["role", "systemPrompt", "task", "needsBrowser", "scopes"],
    },
    execute: async (args: Record<string, unknown>) => {
      const role = args.role as string;
      const systemPrompt = args.systemPrompt as string;
      const task = args.task as string;
      const needsBrowser = args.needsBrowser as boolean;
      const scopes = args.scopes as string[];
      const emailTo = (args.emailTo as string) || opts.plannerInboxAddress || "";
      const collaborateWith = (args.collaborateWith as string[]) || [];

      if (opts.signal?.aborted) throw new Error("Agent killed");

      let spawned;
      try {
        spawned = await spawner.spawnAgent({ role, scopes });
      } catch (err) {
        return { spawned: false, error: (err as Error).message };
      }

      let inboxAddress: string | null = null;
      if (inboxPool) {
        inboxAddress = await inboxPool.allocate(spawned.id, role);
        if (inboxAddress) {
          agentDirectory[role] = inboxAddress;
          opts.sseHub.emit({
            type: "agent_inbox_created",
            agentId: spawned.id,
            payload: { role, inboxAddress },
          });
        }
      }

      const agentTools: AgentTool[] = [];

      if (inboxAddress && inboxPool) {
        agentTools.push(
          ...createAgentEmailTools({
            mailClient: inboxPool.getClient(),
            agentId: spawned.id,
            agentInboxAddress: inboxAddress,
            sseHub: opts.sseHub,
          }),
        );
      }

      let browserCleanup: (() => Promise<void>) | undefined;
      if (needsBrowser && opts.config.FIRECRAWL_API_KEY) {
        try {
          const browserResult = await createBrowserToolsWithSession({
            firecrawlApiKey: opts.config.FIRECRAWL_API_KEY,
            agentId: spawned.id,
            sseHub: opts.sseHub,
          });
          agentTools.push(...browserResult.tools);
          browserCleanup = browserResult.cleanup;
        } catch (err) {
          console.warn("[orchestrator] Browser setup failed for " + role + ":", (err as Error).message);
        }
      }

      let reportedResult = "";
      agentTools.push({
        name: "report_results",
        description: "Report your findings. Use this after emailing your results, or as a fallback if email is unavailable.",
        parameters: {
          type: "object",
          properties: {
            results: { type: "string", description: "JSON string of findings" },
          },
          required: ["results"],
        },
        execute: async (a: Record<string, unknown>) => {
          reportedResult = a.results as string;
          return { acknowledged: true };
        },
      });

      const collabLines = collaborateWith
        .filter((r) => agentDirectory[r])
        .map((r) => "- Coordinate with " + r + " at " + agentDirectory[r] + " -- share relevant findings via email.")
        .join("\n");

      const fullSystemPrompt = systemPrompt + "\n\n" +
        "## Agent Email Directory\n" +
        "You have a real email inbox at: " + (inboxAddress || "not available") + "\n" +
        "The following agents are available to email:\n" +
        buildDirectoryString() + "\n\n" +
        "## Communication Protocol\n" +
        "1. Complete your assigned task using available tools.\n" +
        "2. When done, email your results to the orchestrator at: " + emailTo + "\n" +
        "   Use send_email with a clear subject line and your findings in the body.\n" +
        "3. You can also email other agents to request information or share findings.\n" +
        "4. Use check_inbox to see if other agents have sent you information.\n" +
        "5. Use reply_to_thread to continue an existing email conversation.\n" +
        "6. Also call report_results with a JSON summary as backup.\n" +
        (collabLines ? "\n## Collaboration\n" + collabLines + "\n" : "") +
        "IMPORTANT: Be thorough but efficient. You have a limited number of iterations.";

      const agentPromise = (async (): Promise<string> => {
        try {
          opts.sseHub.emit({
            type: "agent_status",
            agentId: spawned.id,
            payload: { status: "active", role },
          });

          const result = await runAgentLoop({
            model: "gpt-5.2",
            systemPrompt: fullSystemPrompt,
            userMessage: task,
            tools: agentTools,
            onThought: (text) => {
              opts.sseHub.emit({ type: "llm_thinking", agentId: spawned.id, payload: { text } });
            },
            onToolCall: (name, a) => {
              opts.sseHub.emit({ type: "llm_tool_call", agentId: spawned.id, payload: { tool: name, args: a } });
            },
            apiKey: opts.config.OPENAI_API_KEY,
            maxIterations: 12,
            signal: opts.signal,
          });

          if (browserCleanup) await browserCleanup();

          const finalResult = reportedResult || result.finalAnswer;
          opts.sseHub.emit({
            type: "agent_status",
            agentId: spawned.id,
            payload: { status: "completed", role },
          });
          return finalResult;
        } catch (err) {
          if (browserCleanup) await browserCleanup().catch(() => {});
          opts.sseHub.emit({
            type: "agent_status",
            agentId: spawned.id,
            payload: { status: "failed", role, error: (err as Error).message },
          });
          throw err;
        }
      })();

      const running: RunningAgent = {
        id: spawned.id,
        role,
        inboxAddress,
        status: "running",
        promise: agentPromise,
      };
      runningAgents.set(spawned.id, running);

      agentPromise
        .then(() => { running.status = "completed"; })
        .catch(() => { running.status = "failed"; });

      return {
        spawned: true,
        agentId: spawned.id,
        role,
        inboxAddress: inboxAddress || "no-inbox",
        address: spawned.address,
      };
    },
  };

  /* ---------------------------------------------------------------- */
  /*  get_agent_statuses tool                                          */
  /* ---------------------------------------------------------------- */

  const getAgentStatusesTool: AgentTool = {
    name: "get_agent_statuses",
    description: "Check which agents are running, completed, or failed.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async () => {
      const statuses = Array.from(runningAgents.values()).map((a) => ({
        agentId: a.id,
        role: a.role,
        status: a.status,
        inboxAddress: a.inboxAddress,
      }));
      return { agents: statuses };
    },
  };

  /* ---------------------------------------------------------------- */
  /*  wait_for_agents tool                                             */
  /* ---------------------------------------------------------------- */

  const waitForAgentsTool: AgentTool = {
    name: "wait_for_agents",
    description: "Wait up to 60 seconds for all running agents to complete.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async () => {
      const running = Array.from(runningAgents.values()).filter((a) => a.status === "running");
      if (running.length === 0) return { allDone: true, agents: [] };

      opts.sseHub.emit({
        type: "orchestrator_decision",
        agentId: "planner",
        payload: { decision: "waiting", waitingFor: running.map((a) => a.role) },
      });

      const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 60000));
      const allDone = Promise.allSettled(running.map((a) => a.promise)).then(() => "done" as const);
      await Promise.race([allDone, timeout]);

      const results = Array.from(runningAgents.values()).map((a) => ({
        agentId: a.id,
        role: a.role,
        status: a.status,
      }));
      return { agents: results };
    },
  };

  /* ---------------------------------------------------------------- */
  /*  Weather + orchestrator email tools                               */
  /* ---------------------------------------------------------------- */

  const weatherTool = createWeatherTool({
    weatherUrl: opts.config.KITE_WEATHER_URL,
    facilitatorUrl: opts.config.FACILITATOR_URL,
    sseHub: opts.sseHub,
    paymentWallet,
    provider,
    paymentAsset: opts.config.PAYMENT_ASSET,
  });

  const orchestratorEmailTools = createOrchestratorEmailTools({
    agentMailApiKey: opts.config.AGENTMAIL_API_KEY,
    plannerInboxAddress: opts.plannerInboxAddress,
    sseHub: opts.sseHub,
  });

  /* ---------------------------------------------------------------- */
  /*  Coordinator loop                                                 */
  /* ---------------------------------------------------------------- */

  opts.sseHub.emit({
    type: "orchestrator_phase",
    agentId: "planner",
    payload: { phase: "coordinating", message: "Analyzing request and coordinating agents..." },
  });

  const orchestratorSystemPrompt =
    "You are TripDesk Orchestrator -- a coordinator that spawns specialist agents who communicate via email.\n\n" +
    "## Your workflow:\n" +
    "1. Call get_weather to check weather at the destination.\n" +
    "2. Use spawn_agent to create 2-4 specialist agents. Each gets a real on-chain wallet, passport, and email inbox.\n" +
    "   - Use the collaborateWith parameter to tell agents which other agents they should coordinate with.\n" +
    "   - For example, the itinerary-compiler should collaborateWith [\"ride-researcher\", \"restaurant-scout\", \"event-finder\"].\n" +
    "3. Call wait_for_agents to wait for them to finish.\n" +
    "4. Call check_orchestrator_inbox to read their emailed reports.\n" +
    "5. Compile the results and call email_human to send the final itinerary to the requester.\n\n" +
    "## Agent types you can spawn:\n" +
    "- \"ride-researcher\": Searches for rides/transport (needs browser)\n" +
    "- \"restaurant-scout\": Finds restaurants (needs browser)\n" +
    "- \"event-finder\": Discovers events on lu.ma etc (needs browser)\n" +
    "- \"itinerary-compiler\": Compiles results from other agents (no browser needed)\n\n" +
    "## Agent Communication:\n" +
    "- Each agent gets its own email inbox and can send/receive emails to/from any other agent.\n" +
    "- Agents can email you (the orchestrator) and each other directly.\n" +
    "- After spawning all agents, they will work autonomously and email their results.\n" +
    "- The agent directory is shared so they know each other's addresses.\n\n" +
    "## Important:\n" +
    "- Be efficient -- only spawn agents that are truly needed.\n" +
    "- After waiting, ALWAYS check your inbox for their reports before synthesizing.\n" +
    "- The final email to the human should be a beautiful, organized itinerary.";

  await runAgentLoop({
    model: "gpt-5.2",
    systemPrompt: orchestratorSystemPrompt,
    userMessage: "New trip request:\n\nFrom: " + opts.humanEmail.from + "\nSubject: " + opts.humanEmail.subject + "\n\n" + opts.humanEmail.body,
    tools: [
      weatherTool,
      spawnAgentTool,
      getAgentStatusesTool,
      waitForAgentsTool,
      ...orchestratorEmailTools,
    ],
    onThought: (text) => {
      opts.sseHub.emit({ type: "llm_thinking", agentId: "planner", payload: { text } });
    },
    onToolCall: (name, args) => {
      opts.sseHub.emit({
        type: "llm_tool_call",
        agentId: "planner",
        payload: { tool: name, args },
      });
      if (name === "spawn_agent") {
        opts.sseHub.emit({
          type: "orchestrator_decision",
          agentId: "planner",
          payload: { decision: "spawning", role: (args as Record<string, unknown>).role },
        });
      }
    },
    apiKey: opts.config.OPENAI_API_KEY,
    maxIterations: 15,
    signal: opts.signal,
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
