import Fastify from "fastify";
import cors from "@fastify/cors";
import { SSEHub, type SpawnedAgent, type RunEventWriter, createAgentMailClient } from "@kite-stack/agent-core";
import { prisma } from "@kite-stack/db";
import { loadConfig } from "./config.js";
import { runEmailChainTripPlan } from "./orchestrator.js";

const config = loadConfig();

import type { MailBootstrapResult } from "./bootstrap-mail.js";

// Mail addresses populated by bootstrap
let mailAddresses: MailBootstrapResult | null = null;
export function setMailAddresses(addresses: MailBootstrapResult) {
  mailAddresses = addresses;
  app.log.info("AgentMail addresses configured: planner=%s", addresses.plannerInbox.address);
  if (config.AGENTMAIL_API_KEY) {
    startInboxPolling(addresses.plannerInbox.id, config.AGENTMAIL_API_KEY);
  }
}

// ── Inbox polling ────────────────────────────────────────────────────────────
// Polls the planner inbox every 5 s for new messages from external senders.
// This is the local-dev path — in production the webhook fires instead.
const seenThreadIds = new Set<string>();
let pollingActive = false;

function startInboxPolling(inboxId: string, apiKey: string) {
  if (pollingActive) return;
  pollingActive = true;
  const client = createAgentMailClient(apiKey);
  app.log.info("[poll] Inbox polling started for %s", inboxId);

  const poll = async () => {
    try {
      const threads = await client.listThreads(inboxId);
      for (const thread of threads) {
        if (seenThreadIds.has(thread.id)) continue;
        seenThreadIds.add(thread.id);

        const firstMsg = thread.messages[0];
        // Skip internal agent-to-agent messages
        if (!firstMsg || firstMsg.from.endsWith("@agentmail.to")) continue;

        // Fetch full message body
        let body = firstMsg.body;
        try {
          const full = await client.getThread(inboxId, thread.id);
          body = full.messages[0]?.body || body;
        } catch { /* fall back to preview */ }

        const humanEmail = {
          from: firstMsg.from,
          subject: thread.subject || "Trip Request",
          body,
        };

        app.log.info("[poll] New email from %s: %s", humanEmail.from, humanEmail.subject);

        // Broadcast to SSE so the dashboard shows the incoming email immediately
        currentHub.emit({
          type: "email_received",
          agentId: "planner",
          payload: { from: humanEmail.from, subject: humanEmail.subject, body: humanEmail.body.slice(0, 300) },
        });

        // Abort any in-progress run and start a fresh one
        currentAbortController.abort();
        currentAbortController = new AbortController();
        currentHub.newRun();

        runEmailChainTripPlan({
          humanEmail,
          sseHub: currentHub,
          config,
          plannerInboxAddress: inboxId,
          signal: currentAbortController.signal,
        }).catch((err) => {
          if ((err as Error).message === "Agent killed") return;
          app.log.error(err, "Trip planning failed");
          currentHub.emit({ type: "error", agentId: "planner", payload: { message: (err as Error).message } });
        });
      }
    } catch (err) {
      app.log.warn("[poll] Error: %s", (err as Error).message);
    }
    setTimeout(poll, 5000);
  };

  setTimeout(poll, 5000); // first poll after 5 s
}

const dbWriter: RunEventWriter = {
  async write(event) {
    try {
      await prisma.runEvent.create({
        data: {
          runId: event.runId,
          offsetMs: event.offsetMs,
          type: event.type,
          agentId: event.agentId,
          payload: event.payload as any,
        },
      });
    } catch {
      // DB not available (local dev without Postgres) — events still stream via SSE
    }
  },
};

let currentHub = new SSEHub({ dbWriter });

// Global abort controller — aborted by /api/kill, replaced on each new run
let currentAbortController = new AbortController();
export function getCurrentSignal(): AbortSignal {
  return currentAbortController.signal;
}

// Track spawned agents across runs for the /api/agents endpoint
const spawnedAgentsRef: { current: SpawnedAgent[] } = { current: [] };
export function setSpawnedAgents(agents: SpawnedAgent[]) {
  spawnedAgentsRef.current = agents;
}

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true, service: "planner" }));

// SSE endpoint - dashboard connects here (persistent hub, clients survive across runs)
app.get("/api/events", (request, reply) => {
  currentHub.addClient(reply.raw);
  request.raw.on("close", () => currentHub.removeClient(reply.raw));
});

// Spawned agents endpoint
app.get("/api/agents", async () => {
  return {
    agents: spawnedAgentsRef.current.map((a) => ({
      id: a.id,
      role: a.role,
      address: a.address,
      status: a.status,
      fundingTxHash: a.fundingTxHash,
      passportTxHash: a.passportTxHash,
      sessionTxHash: a.sessionTxHash,
      createdAt: a.createdAt,
    })),
  };
});

// SSE replay endpoint
app.get<{ Params: { runId: string } }>("/api/replay/:runId", async (request, reply) => {
  const { runId } = request.params;
  const events = await prisma.runEvent.findMany({
    where: { runId },
    orderBy: { offsetMs: "asc" },
  });

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  let lastOffset = 0;
  for (const event of events) {
    const delay = event.offsetMs - lastOffset;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    lastOffset = event.offsetMs;

    const data = JSON.stringify({ type: event.type, agentId: event.agentId, payload: event.payload, runId: event.runId, offsetMs: event.offsetMs });
    reply.raw.write(`event: ${event.type}\ndata: ${data}\n\n`);

    if (request.raw.destroyed) break;
  }

  reply.raw.write("event: replay_complete\ndata: {}\n\n");
  reply.raw.end();
});

// AgentMail webhook - receives incoming emails
app.post("/api/webhook/email", async (request) => {
  const body = request.body as { from?: string; subject?: string; body?: string; text?: string };
  const humanEmail = {
    from: body.from || mailAddresses?.plannerInbox.address || "tripdesk-planner@agentmail.to",
    subject: body.subject || "Trip Request",
    body: body.body || body.text || "Plan my trip",
  };

  currentAbortController.abort();
  currentAbortController = new AbortController();

  currentHub.newRun();
  runEmailChainTripPlan({ humanEmail, sseHub: currentHub, config, plannerInboxAddress: mailAddresses?.plannerInbox.address, signal: currentAbortController.signal }).catch((err) => {
    if ((err as Error).message === "Agent killed") return;
    app.log.error(err, "Trip planning failed");
    currentHub.emit({ type: "error", agentId: "planner", payload: { message: (err as Error).message } });
  });

  return { ok: true, runId: currentHub.runId };
});

// Manual trigger from dashboard
app.post("/api/trigger", async (request) => {
  const body = (request.body ?? {}) as {
    action?: string;
    from?: string;
    subject?: string;
    body?: string;
  };

  const action = body.action || "plan-trip";
  const defaultHumanEmail = mailAddresses?.plannerInbox.address || "tripdesk-planner@agentmail.to";

  const humanEmail = {
    from: body.from || defaultHumanEmail,
    subject: body.subject || "ETHDenver Trip Planning — 6 Students from UMD (Feb 18–21)",
    body: body.body || `Hi TripDesk! We're a group of 6 college students from the University of Maryland heading to ETHDenver 2025 and need help planning the full trip.

## Travel Details
- **Group size:** 6 students (all early 20s, no mobility needs)
- **Outbound flight:** Wednesday Feb 18, arriving Denver International Airport (DEN) at ~11:00 AM local time
- **Return flight:** Saturday Feb 21, 4:30 PM from DEN. We need to leave the ETHDenver venue at 4850 Western Dr by ~2:00 PM to make our flight.
- **Accommodation:** Airbnb already booked at 2592 Meadowbrook Dr, Denver CO

## What We Need
1. **Airport ride (arrival):** Cheapest/fastest option from DEN → 2592 Meadowbrook Dr on Wednesday ~11 AM. We're 6 people so may need XL or two separate rides — compare Uber, Lyft, and shuttle options.
2. **Airport ride (departure):** Ride from the ETHDenver venue at 4850 Western Dr → DEN on Saturday Feb 21, leaving by ~2:00 PM to catch our 4:30 PM flight.
3. **Daily conference transport:** We're attending the main ETHDenver conference at 4850 Western Dr all week. Need transport from our Airbnb to the venue and back each day.
4. **Side events:** Find AI and blockchain side events during ETHDenver week (Feb 18–21). We especially want AI agent talks, hackathon workshops, and crypto/DeFi meetups. Check lu.ma, Eventbrite, and the ETHDenver side event schedule.
5. **Restaurants:** Budget-friendly Chinese and Mexican spots near the venue or our Airbnb. College student budget — $10–15 per person max. We'll eat out every dinner.
6. **Local transport:** For daily Denver travel, prioritize shortest travel time. Compare RTD light rail, bus, and rideshare.

## Budget & Priorities
- **Budget:** Tight — minimize costs wherever possible
- **Pace:** Relaxed. Conference during the day, food and chill at night.
- **Priority order:** ETHDenver main event → AI/crypto side events → good cheap food → exploring Denver

Please build us a day-by-day itinerary from Wed Feb 18 through Sat Feb 21 with transport options, restaurant picks, and event recommendations. Name: Rachit, email: ${defaultHumanEmail}`,
  };

  if (action === "additional-search") {
    humanEmail.body = "Do another round of ride searches for alternatives.";
  } else if (action === "scope-violation") {
    humanEmail.body = "Also find me ETHDenver merch shops.";
  } else if (action === "post-revoke-test") {
    humanEmail.body = "Register me for one more event on Luma.";
  }

  // Abort any existing run, start fresh
  currentAbortController.abort();
  currentAbortController = new AbortController();

  currentHub.newRun();
  runEmailChainTripPlan({ humanEmail, sseHub: currentHub, config, plannerInboxAddress: mailAddresses?.plannerInbox.address, signal: currentAbortController.signal }).catch((err) => {
    if ((err as Error).message === "Agent killed") {
      app.log.info("Run killed by user");
      return;
    }
    app.log.error(err, "Trip planning failed");
    currentHub.emit({ type: "error", agentId: "planner", payload: { message: (err as Error).message } });
  });

  return { ok: true, runId: currentHub.runId, action };
});

// Kill all agents — aborts the current run
app.post("/api/kill", async () => {
  currentAbortController.abort();
  currentAbortController = new AbortController();

  currentHub.emit({
    type: "orchestrator_phase",
    agentId: "planner",
    payload: { phase: "killed", message: "All agents killed by operator." },
  });

  return { ok: true, killed: true };
});

// Expose inbox addresses for the dashboard
app.get("/api/mail-addresses", async () => {
  if (!mailAddresses) return { configured: false };
  return {
    configured: true,
    planner: mailAddresses.plannerInbox.address,
  };
});

// List previous runs
app.get("/api/runs", async () => {
  const runs = await prisma.runEvent.groupBy({
    by: ["runId"],
    _count: { id: true },
    _max: { offsetMs: true },
    orderBy: { _max: { offsetMs: "desc" } },
    take: 20,
  });
  return { runs };
});

export { app, config };
