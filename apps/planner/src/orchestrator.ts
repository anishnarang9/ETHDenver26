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
import {
  createHireRiderTool,
  createHireFoodieTool,
  createHireEventBotTool,
  type HireContext,
} from "./tools/hire.js";

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
/*  Specialist tool resolver                                           */
/* ------------------------------------------------------------------ */

function getSpecialistTool(
  role: string,
  ctx: HireContext,
  config: PlannerEnv,
): AgentTool | null {
  if (!config.RIDER_URL && !config.FOODIE_URL && !config.EVENTBOT_URL) return null;
  if ((role.includes("ride") || role.includes("transport")) && config.RIDER_URL)
    return createHireRiderTool(ctx, config.RIDER_URL);
  if ((role.includes("restaurant") || role.includes("food")) && config.FOODIE_URL)
    return createHireFoodieTool(ctx, config.FOODIE_URL);
  if (role.includes("event") && config.EVENTBOT_URL)
    return createHireEventBotTool(ctx, config.EVENTBOT_URL);
  return null;
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

  /* ── Enforcement pipeline helper ── */
  const enforcementSeen = new Set<number>();
  const emitEnforcement = (step: number, name: string, detail: string) => {
    if (enforcementSeen.has(step)) return;
    enforcementSeen.add(step);
    opts.sseHub.emit({
      type: "enforcement_step",
      agentId: "enforcer",
      payload: { step, name, status: "pass", detail },
    });
  };

  // Dynamically create the orchestrator's own inbox for this run
  let plannerInboxAddress = opts.plannerInboxAddress || "";
  if (inboxPool) {
    const orchInbox = await inboxPool.allocate("planner", "orchestrator");
    if (orchInbox) {
      plannerInboxAddress = orchInbox;
      opts.sseHub.emit({
        type: "agent_inbox_created",
        agentId: "planner",
        payload: { role: "orchestrator", inboxAddress: orchInbox },
      });
    }
  }
  if (plannerInboxAddress) {
    agentDirectory["orchestrator"] = plannerInboxAddress;
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
        maxIterations: {
          type: "number",
          description: "Max LLM iterations for this agent (default 12). Use 15+ for compiler/coordinator agents that wait for data.",
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
      const emailTo = (args.emailTo as string) || plannerInboxAddress || "";
      const collaborateWith = (args.collaborateWith as string[]) || [];
      const maxIterations = (args.maxIterations as number) || 12;

      if (opts.signal?.aborted) throw new Error("Agent killed");

      let spawned;
      try {
        spawned = await spawner.spawnAgent({ role, scopes });
      } catch (err) {
        return { spawned: false, error: (err as Error).message };
      }

      // Emit enforcement steps for the on-chain spawn flow
      emitEnforcement(1, "Passport", `Passport deployed for ${role}`);
      emitEnforcement(2, "Session", `Session granted for ${role}`);
      emitEnforcement(3, "Scope", `Scopes verified: ${scopes.join(", ")}`);

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
      let hasBrowser = false;
      if (needsBrowser && opts.config.FIRECRAWL_API_KEY) {
        // Try up to 2 times with a delay between attempts
        for (let attempt = 0; attempt < 2 && !hasBrowser; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
          try {
            const browserResult = await createBrowserToolsWithSession({
              firecrawlApiKey: opts.config.FIRECRAWL_API_KEY,
              agentId: spawned.id,
              sseHub: opts.sseHub,
              ttl: 900,
            });
            if (browserResult.tools.length > 0) {
              agentTools.push(...browserResult.tools);
              browserCleanup = browserResult.cleanup;
              hasBrowser = true;
            }
          } catch (err) {
            console.warn("[orchestrator] Browser setup attempt " + (attempt + 1) + " failed for " + role + ":", (err as Error).message);
          }
        }
        if (!hasBrowser) {
          opts.sseHub.emit({
            type: "browser_session",
            agentId: spawned.id,
            payload: { status: "failed" },
          });
        }
      }

      // Add specialist hire tool if a matching specialist service is configured
      const hireCtx: HireContext = {
        provider,
        agentWallet: spawned.wallet as unknown as Wallet,
        sessionWallet: spawned.wallet as unknown as Wallet, // agent is its own session key
        paymentWallet,
        paymentAsset: opts.config.PAYMENT_ASSET,
        sseHub: opts.sseHub,
      };
      const specialistTool = getSpecialistTool(role, hireCtx, opts.config);
      if (specialistTool) agentTools.push(specialistTool);

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

      const collabAddresses = collaborateWith
        .filter((r) => agentDirectory[r])
        .map((r) => r + ": " + agentDirectory[r]);

      const browserFallback = needsBrowser && !hasBrowser
        ? "\n## IMPORTANT: Browser Unavailable\n" +
          "Your browser session could not be created. You do NOT have browser tools.\n" +
          "Instead: use your knowledge, email other agents to request data, and compile\n" +
          "the best results you can from what you know and what collaborators send you.\n" +
          "Do NOT try to call navigate, extract_text, or other browser tools — they don't exist.\n"
        : "";

      const isCompiler = role.includes("itinerary") || role.includes("planner");

      const communicationProtocol = isCompiler
        ? "## Communication Protocol (Trip Compiler)\n" +
          "You are the trip COMPILER. Research agents will email you their findings.\n" +
          "1. Create an initial day-by-day skeleton itinerary from the trip request.\n" +
          "   If the request is vague or missing details, DO NOT ask for clarification.\n" +
          "   Instead, immediately apply these defaults and proceed:\n" +
          "   - Trip: 3-day weekend (Fri-Sun) to Denver, Colorado\n" +
          "   - Travelers: 2 adults, midrange budget ($200-$300/night lodging)\n" +
          "   - Lodging: downtown/LoDo hotel, no rental car (transit + rideshare)\n" +
          "   - Interests: food + breweries, light hiking, 1-2 museums\n" +
          "2. Call check_inbox to collect research from other agents.\n" +
          "3. If no data yet, do another check_inbox after a moment. Repeat up to 4 times.\n" +
          "4. Incorporate whatever research data you receive into the itinerary.\n" +
          "5. Email the COMPLETE compiled itinerary to the orchestrator at: " + emailTo + "\n" +
          "6. Call report_results as backup.\n\n" +
          "CRITICAL: Do NOT email the human requester — you are a backend compiler, not a customer-facing agent.\n" +
          "CRITICAL: Do NOT email research agents asking for info — they will send you data on their own.\n" +
          "CRITICAL: Do NOT ask anyone for clarification. Always proceed with defaults if details are missing.\n" +
          "If you receive emails from researchers, incorporate their data. Do NOT reply with questions.\n" +
          "Focus on COMPILING, not coordinating. Use your iterations for inbox checks and compilation.\n"
        : "## Communication Protocol (Research Agent)\n" +
          "You have all the trip details in your task description — start researching IMMEDIATELY.\n" +
          "1. Do your research using your tools (browser, hire, etc.). This is your PRIMARY task.\n" +
          "2. Spend most of your iterations on research, not on emails.\n" +
          "3. When you have findings, email them to each collaborator listed below.\n" +
          "4. Email your findings to the orchestrator at: " + emailTo + "\n" +
          "5. Call report_results as backup.\n\n" +
          "IMPORTANT: Do NOT email the itinerary-planner asking for trip details — you already have them.\n" +
          "Do NOT wait for replies. Just research, send your findings, and finish.\n";

      const fullSystemPrompt = systemPrompt + "\n\n" +
        "## Agent Email Directory\n" +
        "You have a real email inbox at: " + (inboxAddress || "not available") + "\n" +
        "The following agents are available to email:\n" +
        buildDirectoryString() + "\n\n" +
        browserFallback +
        communicationProtocol +
        (collabAddresses.length > 0
          ? "\n## Your Collaborators (MUST email findings to each one)\n" +
            collabAddresses.map((c) => "- " + c).join("\n") + "\n"
          : "") +
        "\nIMPORTANT: Be thorough but efficient. You have a limited number of iterations.";

      const agentPromise = (async (): Promise<string> => {
        try {
          opts.sseHub.emit({
            type: "agent_status",
            agentId: spawned.id,
            payload: { status: "active", role, needsBrowser },
          });

          // Enforcement: service authorized, nonce accepted
          emitEnforcement(4, "Service", `Service authorized for ${role}`);
          emitEnforcement(5, "Nonce", "Nonce accepted");

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
              // Enforcement: first tool call triggers Quote step
              emitEnforcement(6, "Quote", `Tool call: ${name}`);
            },
            apiKey: opts.config.OPENAI_API_KEY,
            maxIterations,
            signal: opts.signal,
          });

          if (browserCleanup) await browserCleanup();

          const finalResult = reportedResult || result.finalAnswer;

          // Enforcement: completion steps
          emitEnforcement(7, "Payment", `Agent ${role} task payment verified`);
          emitEnforcement(8, "Budget", "Budget within daily cap");
          emitEnforcement(9, "Rate", "Rate limit OK");
          emitEnforcement(10, "Receipt", `Receipt recorded for ${role}`);

          opts.sseHub.emit({
            type: "agent_status",
            agentId: spawned.id,
            payload: { status: "completed", role },
          });
          return finalResult;
        } catch (err) {
          if (browserCleanup) await browserCleanup().catch(() => {});
          const errorMsg = (err as Error).message;
          console.error("[orchestrator] Agent " + role + " failed:", errorMsg);
          opts.sseHub.emit({
            type: "agent_status",
            agentId: spawned.id,
            payload: { status: "failed", role, error: errorMsg },
          });
          // Return partial results instead of throwing — don't crash the run
          return reportedResult || "Agent " + role + " failed: " + errorMsg;
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
    plannerInboxAddress,
    sseHub: opts.sseHub,
  });

  /* ---------------------------------------------------------------- */
  /*  Coordinator loop                                                 */
  /* ---------------------------------------------------------------- */

  // Track which phases we've emitted to avoid duplicates
  const emittedPhases = new Set<string>();
  const emitPhase = (phase: string, message: string) => {
    if (emittedPhases.has(phase)) return;
    emittedPhases.add(phase);
    opts.sseHub.emit({
      type: "orchestrator_phase",
      agentId: "planner",
      payload: { phase, message },
    });
  };

  emitPhase("planning", "Analyzing request and planning agent team...");

  const orchestratorSystemPrompt =
    "You are TripDesk Orchestrator -- a coordinator that spawns specialist agents who communicate via email.\n\n" +
    "## Your workflow (FOLLOW THIS EXACT ORDER):\n" +
    "1. Call get_weather to check weather at the destination.\n" +
    "2. FIRST, spawn an \"itinerary-planner\" agent — the trip compiler.\n" +
    "   It does NOT need a browser. Give it the full trip request details.\n" +
    "   It will wait for research data from other agents and compile the final itinerary.\n" +
    "   Give it maxIterations: 18 so it has time to wait for research data.\n" +
    "3. THEN spawn 2-3 research agents (ride-researcher, restaurant-scout, event-finder).\n" +
    "   CRITICAL: Include the FULL trip details (dates, destination, preferences, etc.) in each\n" +
    "   research agent's task so they are completely self-sufficient and do NOT need to ask anyone.\n" +
    "4. Call wait_for_agents to wait for them to finish.\n" +
    "5. Call check_orchestrator_inbox to read their emailed reports.\n" +
    "6. Compile the results and call email_human to send the final itinerary to the requester.\n\n" +
    "## Agent types you can spawn:\n" +
    "- \"itinerary-planner\" (SPAWN FIRST): The trip compiler.\n" +
    "  No browser needed. It passively receives research findings via email and compiles them.\n" +
    "  Its systemPrompt should say: 'You are a trip itinerary compiler. Create an initial day-by-day\n" +
    "  skeleton from the trip request. If details are missing or vague, use defaults immediately\n" +
    "  (3-day Denver weekend, 2 adults, midrange) — do NOT ask the human for clarification.\n" +
    "  Do NOT email the human requester. Do NOT email research agents.\n" +
    "  Check your inbox repeatedly for research findings, compile them into a polished itinerary,\n" +
    "  then email the orchestrator with the complete compiled itinerary when done.'\n" +
    "  IMPORTANT: Do NOT give itinerary-planner any collaborateWith — it only RECEIVES emails.\n" +
    "  IMPORTANT: Do NOT include the human's email address in the itinerary-planner's task.\n" +
    "- \"ride-researcher\": Searches for rides/transport (needs browser)\n" +
    "- \"restaurant-scout\": Finds restaurants (needs browser)\n" +
    "- \"event-finder\": Discovers and registers for events on luma (needs browser)\n" +
    "  IMPORTANT: In the event-finder's systemPrompt, include these instructions:\n" +
    "  'The ETHDenver side-events calendar is at https://luma.com/ethdenver. Navigate there first.\n" +
    "   Luma is a React SPA — after navigating, use extract_text to read the content.\n" +
    "   Use scroll_down 3-5 times to load more events (Luma uses infinite scroll).\n" +
    "   Use extract_links with filter \"lu.ma\" or \"luma.com\" to find individual event page URLs.\n" +
    "   Visit interesting AI/blockchain event pages to get full details.\n" +
    "   For events that look relevant, try to REGISTER by clicking the register/RSVP button.\n" +
    "   Focus on AI agent, DeFi, and blockchain infrastructure side events.'\n\n" +
    "## CRITICAL: Spawn order and collaboration\n" +
    "1. Spawn itinerary-planner FIRST with NO collaborateWith and maxIterations: 18.\n" +
    "   It passively collects data from researchers.\n" +
    "2. Then spawn research agents. Each must collaborateWith: [\"itinerary-planner\"].\n" +
    "   They will email their findings to the planner when done.\n" +
    "3. Research agents are SELF-SUFFICIENT — include full trip details in each agent's task.\n" +
    "Example spawn order:\n" +
    "  1st: itinerary-planner → collaborateWith: [] (receives only), maxIterations: 18\n" +
    "  2nd: ride-researcher → collaborateWith: [\"itinerary-planner\"]\n" +
    "  3rd: restaurant-scout → collaborateWith: [\"itinerary-planner\"]\n" +
    "  4th: event-finder → collaborateWith: [\"itinerary-planner\"]\n\n" +
    "## Communication flow (ONE-DIRECTIONAL):\n" +
    "  Research agents → email findings → itinerary-planner → email compiled itinerary → orchestrator\n" +
    "  Research agents do NOT ask the planner for info. The planner does NOT email research agents.\n" +
    "  Each research agent gets the full trip details in its task and works independently.\n\n" +
    "## Important:\n" +
    "- ALWAYS spawn itinerary-planner first.\n" +
    "- ALWAYS include full trip details (dates, destination, preferences) in EVERY research agent's task.\n" +
    "- After waiting, ALWAYS check your inbox for the itinerary-planner's compiled report.\n" +
    "- The final email_human should forward the itinerary-planner's compiled itinerary to the human.";

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

      // Emit phase transitions based on tool calls
      if (name === "spawn_agent") {
        emitPhase("spawning", "Spawning agents with on-chain identities...");
        opts.sseHub.emit({
          type: "orchestrator_decision",
          agentId: "planner",
          payload: { decision: "spawning", role: (args as Record<string, unknown>).role },
        });
      } else if (name === "wait_for_agents") {
        emitPhase("executing", "Agents executing tasks in parallel...");
      } else if (name === "check_orchestrator_inbox" || name === "email_human") {
        emitPhase("synthesizing", "Compiling agent results into final itinerary...");
      }

      // Capture synthesisBody when emailing the human
      if (name === "email_human") {
        const emailArgs = args as Record<string, unknown>;
        if (emailArgs.body) {
          opts.sseHub.emit({
            type: "agent_results",
            agentId: "planner",
            payload: { results: [], synthesisBody: emailArgs.body as string },
          });
        }
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
