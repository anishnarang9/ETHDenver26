import { createAgentMailClient, type SSEHub } from "@kite-stack/agent-core";

export function createEmailTools(opts: {
  agentMailApiKey: string;
  plannerInboxAddress?: string;
  sseHub: SSEHub;
}) {
  const mailClient = opts.agentMailApiKey ? createAgentMailClient(opts.agentMailApiKey) : null;

  return [
    {
      name: "email_agent",
      description: "Send an email to a specialist agent for coordination",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Agent email address" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "subject", "body"],
      },
      execute: async (args: Record<string, unknown>) => {
        if (!mailClient || !opts.plannerInboxAddress) {
          return { sent: false, reason: "AgentMail not configured" };
        }
        const result = await mailClient.sendMessage({
          from: opts.plannerInboxAddress,
          to: args.to as string,
          subject: args.subject as string,
          body: args.body as string,
        });
        opts.sseHub.emit({ type: "email_sent", agentId: "planner", payload: { to: args.to, subject: args.subject, messageId: result.messageId } });
        return { sent: true, messageId: result.messageId, threadId: result.threadId };
      },
    },
    {
      name: "email_human",
      description: "Send the final itinerary or status update email to the human requester",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Human email address" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "subject", "body"],
      },
      execute: async (args: Record<string, unknown>) => {
        if (!mailClient || !opts.plannerInboxAddress) {
          opts.sseHub.emit({ type: "email_sent", agentId: "planner", payload: { to: args.to, subject: args.subject, body: args.body, mock: true } });
          return { sent: true, mock: true, note: "AgentMail not configured, email logged to SSE" };
        }
        const result = await mailClient.sendMessage({
          from: opts.plannerInboxAddress,
          to: args.to as string,
          subject: args.subject as string,
          body: args.body as string,
        });
        opts.sseHub.emit({ type: "email_sent", agentId: "planner", payload: { to: args.to, subject: args.subject, messageId: result.messageId } });
        return { sent: true, messageId: result.messageId };
      },
    },
  ];
}
