// This module resolves the planner's AgentMail inbox at startup
// and registers a webhook so incoming emails trigger trip planning.
// Agent inboxes are now created dynamically per run by the orchestrator's InboxPool.

import { createAgentMailClient } from "@kite-stack/agent-core";

export interface MailBootstrapResult {
  plannerInbox: { id: string; address: string };
}

const PLANNER_USERNAME = "tripdesk-planner";
const PLACEHOLDER = { id: "unknown", address: "not-configured" };

export async function bootstrapAgentMail(opts: {
  apiKey: string;
  plannerBaseUrl: string;
}): Promise<MailBootstrapResult> {
  console.log("[bootstrap-mail] Bootstrapping planner inbox...");

  const client = createAgentMailClient(opts.apiKey);

  // 1. Fetch existing inboxes to avoid re-creating
  let existingInboxes: string[] = [];
  try {
    const res = await fetch("https://api.agentmail.to/v0/inboxes", {
      headers: { Authorization: "Bearer " + opts.apiKey },
    });
    if (res.ok) {
      const data = (await res.json()) as { inboxes: Array<{ inbox_id: string }> };
      existingInboxes = data.inboxes.map((i) => i.inbox_id);
      console.log("[bootstrap-mail] Found", existingInboxes.length, "existing inboxes");
    }
  } catch {
    console.warn("[bootstrap-mail] Could not list existing inboxes, will try creating");
  }

  // 2. Resolve planner inbox
  const expectedAddress = PLANNER_USERNAME + "@agentmail.to";
  let plannerInbox: { id: string; address: string };

  if (existingInboxes.includes(expectedAddress)) {
    console.log("[bootstrap-mail] Reusing existing inbox:", expectedAddress);
    plannerInbox = { id: expectedAddress, address: expectedAddress };
  } else {
    try {
      plannerInbox = await client.createInbox(PLANNER_USERNAME);
      console.log("[bootstrap-mail] Created inbox:", plannerInbox.address);
    } catch (err) {
      console.warn("[bootstrap-mail] Failed to create planner inbox:", (err as Error).message);
      plannerInbox = PLACEHOLDER;
    }
  }

  // 3. Register webhook on planner inbox
  if (plannerInbox.id !== "unknown") {
    try {
      const webhook = await client.createWebhook({
        url: opts.plannerBaseUrl + "/api/webhook/email",
        inboxId: plannerInbox.id,
        events: ["message.received"],
      });
      console.log("[bootstrap-mail] Registered webhook:", webhook.webhookId);
    } catch (err) {
      console.warn("[bootstrap-mail] Failed to register webhook:", (err as Error).message);
    }
  }

  console.log("[bootstrap-mail] Planner inbox:", plannerInbox.address);
  console.log("[bootstrap-mail] Agent inboxes will be created dynamically per run.");

  return { plannerInbox };
}
