// This module creates AgentMail inboxes for all agents at startup
// and registers a webhook so incoming emails trigger trip planning.

import { createAgentMailClient } from "@kite-stack/agent-core";

export interface MailBootstrapResult {
  plannerInbox: { id: string; address: string };
  riderInbox: { id: string; address: string };
  foodieInbox: { id: string; address: string };
  eventbotInbox: { id: string; address: string };
}

const PLACEHOLDER = { id: "unknown", address: "not-configured" };

async function safeCreateInbox(
  client: ReturnType<typeof createAgentMailClient>,
  username: string,
): Promise<{ id: string; address: string }> {
  try {
    const inbox = await client.createInbox(username);
    console.log("[bootstrap-mail] Created inbox:", username, "->", inbox.address);
    return inbox;
  } catch (err) {
    console.warn(`[bootstrap-mail] Failed to create inbox "${username}":`, (err as Error).message);
    return PLACEHOLDER;
  }
}

export async function bootstrapAgentMail(opts: {
  apiKey: string;
  plannerBaseUrl: string;
}): Promise<MailBootstrapResult> {
  console.log("[bootstrap-mail] Bootstrapping AgentMail inboxes...");

  // 1. Create AgentMail client
  const client = createAgentMailClient(opts.apiKey);

  // 2. Create inboxes for all agents
  const [plannerInbox, riderInbox, foodieInbox, eventbotInbox] = await Promise.all([
    safeCreateInbox(client, "tripdesk-planner"),
    safeCreateInbox(client, "tripdesk-rider"),
    safeCreateInbox(client, "tripdesk-foodie"),
    safeCreateInbox(client, "tripdesk-eventbot"),
  ]);

  // 3. Register webhook on planner inbox
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
  } else {
    console.warn("[bootstrap-mail] Skipping webhook registration — planner inbox not available");
  }

  // 4. Log all created addresses
  console.log("[bootstrap-mail] Inbox addresses:");
  console.log("[bootstrap-mail]   planner :", plannerInbox.address);
  console.log("[bootstrap-mail]   rider   :", riderInbox.address);
  console.log("[bootstrap-mail]   foodie  :", foodieInbox.address);
  console.log("[bootstrap-mail]   eventbot:", eventbotInbox.address);

  // 5. Return the result
  return { plannerInbox, riderInbox, foodieInbox, eventbotInbox };
}
