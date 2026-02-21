import Fastify from "fastify";
import cors from "@fastify/cors";
import { SSEHub, type SpawnedAgent, type RunEventWriter } from "@kite-stack/agent-core";
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
    subject: body.subject || "ETHDenver Trip",
    body: body.body || `Hi TripDesk! We're a group of 6 college students from the University of Maryland heading to ETHDenver 2025.

## Travel Details
- **Group size:** 6 students (all early 20s, no mobility needs)
- **Departure:** Wednesday Feb 18, 8:00 AM from DCA (Reagan National Airport)
- **Arrival:** Denver International Airport (DEN) at ~11:00 AM local time
- **Return:** Sunday Feb 23 (flexible on exact time)
- **Accommodation:** Airbnb already booked at 2592 Meadowbrook Dr, Denver CO

## What We Need
1. **Airport ride:** Cheapest/fastest ride from Denver International Airport (DEN) to 2592 Meadowbrook Dr on Wednesday ~11 AM. Compare Uber, Lyft, shuttle options. We're 6 people so may need XL or two rides.
2. **ETHDenver conference:** We're attending the main ETHDenver conference at the National Western Complex. Need daily transport from our Airbnb to the venue and back.
3. **Side events:** Find AI and blockchain technology side events happening during ETHDenver week (Feb 18-23). We especially want AI agent talks, hackathon workshops, and crypto/DeFi meetups. Check lu.ma, eventbrite, and ETHDenver side event lists.
4. **Restaurants:** Find budget-friendly Chinese and Mexican restaurants near the ETHDenver venue or near our Airbnb. We're college students so keep it cheap ($10-15 per person max). We'll eat out every dinner.
5. **Local transport:** For getting around Denver during the week, prioritize shortest travel time. Compare RTD light rail, bus, rideshare.

## Budget & Style
- **Budget:** College student tight -- minimize costs everywhere
- **Pace:** Relaxed. We don't want to rush. Conference during the day, food and chill at night.
- **Priorities:** 1) ETHDenver main event 2) AI/crypto side events 3) Good cheap food 4) Exploring Denver if time permits

Please build us a day-by-day itinerary from Wed Feb 18 through Sun Feb 23 with transport options, restaurant picks, and event recommendations. Name: Rachit, email: ${defaultHumanEmail}`,
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
