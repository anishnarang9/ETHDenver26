import { JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes } from "ethers";
import { type SSEHub } from "@kite-stack/agent-core";
import { PAYMENT_REQUIRED_HEADER, X_ACTION_ID_HEADER, X_TX_HASH_HEADER, type PaymentChallenge } from "@kite-stack/shared-types";
import { randomUUID } from "node:crypto";

const ERC20_ABI = ["function transfer(address to, uint256 value) returns (bool)"];

export interface HireContext {
  provider: JsonRpcProvider;
  agentWallet: Wallet;
  sessionWallet: Wallet;
  paymentWallet: Wallet;
  paymentAsset: string;
  sseHub: SSEHub;
}

const buildBodyHash = (body: unknown): string => keccak256(toUtf8Bytes(JSON.stringify(body ?? {})));

const buildCanonicalMessage = (input: { agentAddress: string; sessionAddress: string; timestamp: string; nonce: string; bodyHash: string }): string =>
  [input.agentAddress, input.sessionAddress, input.timestamp, input.nonce, input.bodyHash].join("|");

/* ------------------------------------------------------------------ */
/*  SSE forwarder – bridges enforcement_step events from specialist    */
/* ------------------------------------------------------------------ */

async function forwardSSE(specialistUrl: string, plannerHub: SSEHub, signal: AbortSignal): Promise<void> {
  try {
    const res = await fetch(`${specialistUrl}/api/events`, {
      signal,
      headers: { accept: "text/event-stream" },
    });
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop()!;
      for (const block of blocks) {
        const dataLine = block.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          const event = JSON.parse(dataLine.slice(5));
          if (event.type === "enforcement_step") {
            plannerHub.emit({ type: "enforcement_step", agentId: event.agentId ?? "enforcer", payload: event.payload });
          }
        } catch { /* ignore malformed events */ }
      }
    }
  } catch {
    // aborted or connection failed — expected when controller.abort() fires
  }
}

/* ------------------------------------------------------------------ */
/*  callSpecialist – 402 payment dance + SSE forwarding                */
/* ------------------------------------------------------------------ */

async function callSpecialist(ctx: HireContext, url: string, routePath: string, body: Record<string, unknown>): Promise<unknown> {
  // Open SSE bridge to forward enforcement_step events from specialist
  const controller = new AbortController();
  const sseForwarder = forwardSSE(url, ctx.sseHub, controller.signal);

  try {
    const bodyHash = buildBodyHash(body);
    const actionId = randomUUID();
    const timestamp = new Date().toISOString();
    const nonce = randomUUID();
    const canonical = buildCanonicalMessage({ agentAddress: ctx.agentWallet.address, sessionAddress: ctx.sessionWallet.address, timestamp, nonce, bodyHash });
    const signature = await ctx.sessionWallet.signMessage(canonical);

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-agent-address": ctx.agentWallet.address,
      "x-session-address": ctx.sessionWallet.address,
      "x-timestamp": timestamp,
      "x-nonce": nonce,
      "x-body-hash": bodyHash,
      "x-signature": signature,
      [X_ACTION_ID_HEADER]: actionId,
    };

    // Step 1: First request -> expect 402
    const firstRes = await fetch(`${url}${routePath}`, { method: "POST", headers, body: JSON.stringify(body) });

    if (firstRes.status !== 402) {
      if (firstRes.ok) return await firstRes.json();
      throw new Error(`Expected 402, got ${firstRes.status}: ${await firstRes.text()}`);
    }

    // Step 2: Parse challenge
    const challengeHeader = firstRes.headers.get(PAYMENT_REQUIRED_HEADER);
    const challengeBody = await firstRes.json() as { challenge?: PaymentChallenge };
    const challenge: PaymentChallenge | null = challengeHeader ? JSON.parse(challengeHeader) : challengeBody.challenge ?? null;
    if (!challenge) throw new Error("402 without challenge");

    ctx.sseHub.emit({ type: "payment_start", agentId: "planner", payload: { target: routePath, amount: challenge.amountAtomic, method: "direct-transfer" } });

    // Step 3: Direct ERC20 transfer
    const token = new Contract(challenge.asset, ERC20_ABI, ctx.paymentWallet.connect(ctx.provider));
    const tx = await token.transfer(challenge.payTo, BigInt(challenge.amountAtomic));
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error("ERC20 transfer reverted");

    ctx.sseHub.emit({ type: "payment_complete", agentId: "planner", payload: { target: routePath, txHash: tx.hash, amount: challenge.amountAtomic, method: "direct-transfer" } });

    // Step 4: Retry with payment proof
    const retryNonce = randomUUID();
    const retryTimestamp = new Date().toISOString();
    const retryCanonical = buildCanonicalMessage({ agentAddress: ctx.agentWallet.address, sessionAddress: ctx.sessionWallet.address, timestamp: retryTimestamp, nonce: retryNonce, bodyHash });
    const retrySignature = await ctx.sessionWallet.signMessage(retryCanonical);

    const retryHeaders: Record<string, string> = {
      "content-type": "application/json",
      "x-agent-address": ctx.agentWallet.address,
      "x-session-address": ctx.sessionWallet.address,
      "x-timestamp": retryTimestamp,
      "x-nonce": retryNonce,
      "x-body-hash": bodyHash,
      "x-signature": retrySignature,
      [X_ACTION_ID_HEADER]: challenge.actionId,
      [X_TX_HASH_HEADER]: tx.hash,
    };

    const retryRes = await fetch(`${url}${routePath}`, { method: "POST", headers: retryHeaders, body: JSON.stringify(body) });
    if (!retryRes.ok) throw new Error(`Retry failed: ${retryRes.status} ${await retryRes.text()}`);
    return await retryRes.json();
  } finally {
    controller.abort();
    await sseForwarder;
  }
}

export function createHireRiderTool(ctx: HireContext, riderUrl: string) {
  return {
    name: "hire_rider",
    description: "Hire the Rider agent to search for transportation options. Costs 0.50 tokens.",
    parameters: {
      type: "object",
      properties: {
        origin: { type: "string", description: "Starting location" },
        destination: { type: "string", description: "Destination location" },
        date: { type: "string", description: "Travel date" },
        preferences: { type: "string", description: "Optional ride preferences" },
      },
      required: ["origin", "destination", "date"],
    },
    execute: async (args: Record<string, unknown>) => {
      ctx.sseHub.emit({ type: "agent_status", agentId: "rider", payload: { status: "active" } });
      const result = await callSpecialist(ctx, riderUrl, "/api/find-rides", args);
      ctx.sseHub.emit({ type: "agent_status", agentId: "rider", payload: { status: "idle" } });
      return result;
    },
  };
}

export function createHireFoodieTool(ctx: HireContext, foodieUrl: string) {
  return {
    name: "hire_foodie",
    description: "Hire the Foodie agent to search for restaurants. Costs 1.0 token.",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string" },
        date: { type: "string" },
        cuisine: { type: "string" },
        weather: { type: "string" },
        partySize: { type: "number" },
      },
      required: ["location", "date"],
    },
    execute: async (args: Record<string, unknown>) => {
      ctx.sseHub.emit({ type: "agent_status", agentId: "foodie", payload: { status: "active" } });
      const result = await callSpecialist(ctx, foodieUrl, "/api/find-restaurants", args);
      ctx.sseHub.emit({ type: "agent_status", agentId: "foodie", payload: { status: "idle" } });
      return result;
    },
  };
}

export function createHireEventBotTool(ctx: HireContext, eventbotUrl: string) {
  return {
    name: "hire_eventbot",
    description: "Hire EventBot to search for events. Costs 0.50 tokens.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        location: { type: "string" },
        dateRange: { type: "string" },
        interests: { type: "string" },
      },
      required: ["query", "location", "dateRange"],
    },
    execute: async (args: Record<string, unknown>) => {
      ctx.sseHub.emit({ type: "agent_status", agentId: "eventbot", payload: { status: "active" } });
      const result = await callSpecialist(ctx, eventbotUrl, "/api/find-events", args);
      ctx.sseHub.emit({ type: "agent_status", agentId: "eventbot", payload: { status: "idle" } });
      return result;
    },
  };
}

export function createRegisterEventTool(ctx: HireContext, eventbotUrl: string) {
  return {
    name: "register_event",
    description: "Register for an event via EventBot. Costs 1.0 token.",
    parameters: {
      type: "object",
      properties: {
        eventUrl: { type: "string" },
        name: { type: "string" },
        email: { type: "string" },
      },
      required: ["eventUrl", "name", "email"],
    },
    execute: async (args: Record<string, unknown>) => {
      ctx.sseHub.emit({ type: "agent_status", agentId: "eventbot", payload: { status: "active" } });
      const result = await callSpecialist(ctx, eventbotUrl, "/api/register-event", args);
      ctx.sseHub.emit({ type: "agent_status", agentId: "eventbot", payload: { status: "idle" } });
      return result;
    },
  };
}
