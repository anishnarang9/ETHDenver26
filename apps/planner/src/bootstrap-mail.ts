// This module resolves AgentMail inboxes for all agents at startup
// and registers a webhook so incoming emails trigger trip planning.
// Inboxes are created once and reused — we check existing inboxes first
// to avoid hitting the 10-inbox limit on re-deploys.

import { createAgentMailClient } from "@kite-stack/agent-core";

export interface MailBootstrapResult {
  plannerInbox: { id: string; address: string };
  riderInbox: { id: string; address: string };
  foodieInbox: { id: string; address: string };
  eventbotInbox: { id: string; address: string };
}

const AGENT_USERNAMES = {
  planner: "tripdesk-planner",
  rider: "tripdesk-rider",
  foodie: "tripdesk-foodie",
  eventbot: "tripdesk-eventbot",
} as const;

const PLACEHOLDER = { id: "unknown", address: "not-configured" };

export async function bootstrapAgentMail(opts: {
  apiKey: string;
  plannerBaseUrl: string;
}): Promise<MailBootstrapResult> {
  console.log("[bootstrap-mail] Bootstrapping AgentMail inboxes...");

  const client = createAgentMailClient(opts.apiKey);

  // 1. Fetch existing inboxes to avoid re-creating
  let existingInboxes: string[] = [];
  try {
    const res = await fetch("https://api.agentmail.to/v0/inboxes", {
      headers: { "Authorization": `Bearer ${opts.apiKey}` },
    });
    if (res.ok) {
      const data = await res.json() as { inboxes: Array<{ inbox_id: string }> };
      existingInboxes = data.inboxes.map((i) => i.inbox_id);
      console.log("[bootstrap-mail] Found", existingInboxes.length, "existing inboxes");
    }
  } catch {
    console.warn("[bootstrap-mail] Could not list existing inboxes, will try creating");
  }

  // 2. Resolve each inbox — use existing or create new
  async function resolveInbox(username: string): Promise<{ id: string; address: string }> {
    const expectedAddress = `${username}@agentmail.to`;
    if (existingInboxes.includes(expectedAddress)) {
      console.log("[bootstrap-mail] Reusing existing inbox:", expectedAddress);
      return { id: expectedAddress, address: expectedAddress };
    }
    try {
      const inbox = await client.createInbox(username);
      console.log("[bootstrap-mail] Created inbox:", username, "->", inbox.address);
      return inbox;
    } catch (err) {
      console.warn(`[bootstrap-mail] Failed to create inbox "${username}":`, (err as Error).message);
      return PLACEHOLDER;
    }
  }

  const [plannerInbox, riderInbox, foodieInbox, eventbotInbox] = await Promise.all([
    resolveInbox(AGENT_USERNAMES.planner),
    resolveInbox(AGENT_USERNAMES.rider),
    resolveInbox(AGENT_USERNAMES.foodie),
    resolveInbox(AGENT_USERNAMES.eventbot),
  ]);

  // 3. Register webhook on planner inbox (idempotent — AgentMail deduplicates by URL)
  if (plannerInbox.id !== "unknown") {
    try {
      const webhook = await client.createWebhook({
        url: `${opts.plannerBaseUrl}/api/webhook/email`,
        inboxId: plannerInbox.id,
        events: ["message.received"],
      });
      console.log("[bootstrap-mail] Registered webhook:", webhook.webhookId);
    } catch (err) {
      console.warn("[bootstrap-mail] Failed to register webhook:", (err as Error).message);
    }
  }

  // 4. Log summary
  console.log("[bootstrap-mail] Inbox addresses:");
  console.log("[bootstrap-mail]   planner :", plannerInbox.address);
  console.log("[bootstrap-mail]   rider   :", riderInbox.address);
  console.log("[bootstrap-mail]   foodie  :", foodieInbox.address);
  console.log("[bootstrap-mail]   eventbot:", eventbotInbox.address);

  return { plannerInbox, riderInbox, foodieInbox, eventbotInbox };
}
