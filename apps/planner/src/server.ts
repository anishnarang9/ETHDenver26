import Fastify from "fastify";
import cors from "@fastify/cors";
import { SSEHub, type SpawnedAgent, type RunEventWriter, createAgentMailClient } from "@kite-stack/agent-core";
import { prisma } from "@kite-stack/db";
import nodemailer from "nodemailer";
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
        if (!firstMsg) continue;
        // Skip internal agent-to-agent messages (td-* inboxes).
        // Allow human-proxy inboxes (non td-* agentmail addresses) and external senders.
        const sender = firstMsg.from;
        const isInternalAgent = sender.endsWith("@agentmail.to") && sender.startsWith("td-");
        if (isInternalAgent) continue;

        // Fetch full message body
        let body = firstMsg.body;
        try {
          const full = await client.getThread(inboxId, thread.id);
          body = full.messages[0]?.body || body;
        } catch { /* fall back to preview */ }

        // Extract Reply-To or [From: ...] if the email was sent via SMTP relay or AgentMail proxy
        let realFrom = firstMsg.from;
        const replyToMatch = body.match(/\[Reply-To:\s*([^\]\s]+)\]/);
        const fromMatch = body.match(/\[From:\s*([^\]\s]+)\]/);
        if (replyToMatch) realFrom = replyToMatch[1];
        else if (fromMatch) realFrom = fromMatch[1];

        // Strip the [Reply-To: ...] / [From: ...] prefix from the body
        const cleanBody = body.replace(/^\[(?:Reply-To|From):\s*[^\]]+\]\s*\n*/i, "").trim();

        const humanEmail = {
          from: realFrom,
          subject: thread.subject || "Trip Request",
          body: cleanBody,
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

// ── Send real email to planner inbox ─────────────────────────────────────────
// Two modes:
//   1. SMTP configured → send from user's real email address via SMTP
//   2. Fallback → create a human-proxy AgentMail inbox and send from there
app.post("/api/send-email", async (request) => {
  const body = (request.body ?? {}) as {
    from: string;
    subject: string;
    body: string;
  };

  if (!body.from || !body.subject || !body.body) {
    return { ok: false, error: "Missing from, subject, or body" };
  }

  const plannerAddress = mailAddresses?.plannerInbox.address;
  if (!plannerAddress) {
    return { ok: false, error: "Planner inbox not configured — AgentMail may be unavailable" };
  }

  // Try SMTP first
  if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: Number(config.SMTP_PORT) || 587,
        secure: Number(config.SMTP_PORT) === 465,
        auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
      });

      // Gmail overrides 'from' to match the authenticated account.
      // Embed the user's claimed address in the body so the orchestrator knows who to reply to.
      await transporter.sendMail({
        from: config.SMTP_USER,
        to: plannerAddress,
        subject: body.subject,
        text: `[Reply-To: ${body.from}]\n\n${body.body}`,
        replyTo: body.from,
      });

      app.log.info("[send-email] Sent via SMTP from %s to %s", body.from, plannerAddress);
      return { ok: true, method: "smtp", from: body.from, to: plannerAddress };
    } catch (err) {
      app.log.warn("[send-email] SMTP failed, falling back to AgentMail relay: %s", (err as Error).message);
      // Fall through to AgentMail relay
    }
  }

  // Fallback: AgentMail relay — create a human-proxy inbox and send from there
  if (!config.AGENTMAIL_API_KEY) {
    return { ok: false, error: "Neither SMTP nor AgentMail configured" };
  }

  try {
    const client = createAgentMailClient(config.AGENTMAIL_API_KEY);

    // Derive a stable proxy username from the user's email (e.g. "vagarwa4" from "vagarwa4@terpmail.umd.edu")
    const localPart = body.from.split("@")[0] || "human";
    const proxyUsername = localPart + "-human";

    // Try to create or reuse the proxy inbox
    let proxyAddress: string;
    try {
      const inbox = await client.createInbox(proxyUsername);
      proxyAddress = inbox.address;
    } catch {
      // Inbox already exists — reuse it
      proxyAddress = proxyUsername + "@agentmail.to";
    }

    await client.sendMessage({
      from: proxyAddress,
      to: plannerAddress,
      subject: body.subject,
      body: `[From: ${body.from}]\n\n${body.body}`,
    });

    app.log.info("[send-email] Sent via AgentMail relay from %s (proxy for %s) to %s", proxyAddress, body.from, plannerAddress);
    return { ok: true, method: "agentmail-relay", from: body.from, proxy: proxyAddress, to: plannerAddress };
  } catch (err) {
    return { ok: false, error: `AgentMail relay failed: ${(err as Error).message}` };
  }
});

// Manual trigger from dashboard (kept for special demo actions that bypass email)
app.post("/api/trigger", async (request) => {
  const body = (request.body ?? {}) as {
    action?: string;
    from?: string;
    subject?: string;
    body?: string;
  };

  const action = body.action || "plan-trip";

  // For the main plan-trip action, require from/subject/body from the caller
  // (the compose form in mission-control sends these)
  const humanFrom = body.from || "unknown@user.com";

  const humanEmail = {
    from: humanFrom,
    subject: body.subject || "Trip Request",
    body: body.body || "Please plan my trip.",
  };

  // Override body for special demo actions
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
