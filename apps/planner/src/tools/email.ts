import { createAgentMailClient, type AgentMailClient, type SSEHub, type AgentTool } from "@kite-stack/agent-core";

/* ------------------------------------------------------------------ */
/*  Per-agent email tools (used by spawned agents)                     */
/* ------------------------------------------------------------------ */

export function createAgentEmailTools(opts: {
  mailClient: AgentMailClient;
  agentId: string;
  agentInboxAddress: string;
  sseHub: SSEHub;
}): AgentTool[] {
  return [
    {
      name: "send_email",
      description: "Send an email from your inbox to another agent or the orchestrator.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body text" },
        },
        required: ["to", "subject", "body"],
      },
      execute: async (args: Record<string, unknown>) => {
        const result = await opts.mailClient.sendMessage({
          from: opts.agentInboxAddress,
          to: args.to as string,
          subject: args.subject as string,
          body: args.body as string,
        });
        opts.sseHub.emit({
          type: "agent_email_sent",
          agentId: opts.agentId,
          payload: {
            from: opts.agentInboxAddress,
            to: args.to as string,
            subject: args.subject as string,
            body: args.body as string,
            messageId: result.messageId,
            threadId: result.threadId,
          },
        });
        return { sent: true, messageId: result.messageId, threadId: result.threadId };
      },
    },
    {
      name: "check_inbox",
      description: "Check your inbox for new emails from other agents or the orchestrator.",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async () => {
        const threads = await opts.mailClient.listThreads(opts.agentInboxAddress);
        opts.sseHub.emit({
          type: "agent_email_received",
          agentId: opts.agentId,
          payload: { threadCount: threads.length, inbox: opts.agentInboxAddress },
        });
        return {
          threads: threads.map((t) => ({
            threadId: t.id,
            subject: t.subject,
            latestMessage: t.messages[t.messages.length - 1]?.body || "",
            from: t.messages[0]?.from || "",
          })),
        };
      },
    },
    {
      name: "reply_to_thread",
      description: "Reply to an existing email thread.",
      parameters: {
        type: "object",
        properties: {
          threadId: { type: "string", description: "Thread ID to reply to" },
          to: { type: "string", description: "Recipient email address" },
          body: { type: "string", description: "Reply body text" },
        },
        required: ["threadId", "to", "body"],
      },
      execute: async (args: Record<string, unknown>) => {
        const result = await opts.mailClient.sendMessage({
          from: opts.agentInboxAddress,
          to: args.to as string,
          subject: "Re: thread",
          body: args.body as string,
          inReplyTo: args.threadId as string,
        });
        opts.sseHub.emit({
          type: "agent_email_sent",
          agentId: opts.agentId,
          payload: {
            from: opts.agentInboxAddress,
            to: args.to as string,
            subject: "Re: thread",
            body: args.body as string,
            messageId: result.messageId,
            threadId: result.threadId,
            isReply: true,
          },
        });
        return { sent: true, messageId: result.messageId, threadId: result.threadId };
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Orchestrator email tools (used by planner)                         */
/* ------------------------------------------------------------------ */

export function createOrchestratorEmailTools(opts: {
  agentMailApiKey: string;
  plannerInboxAddress?: string;
  sseHub: SSEHub;
}): AgentTool[] {
  const mailClient = opts.agentMailApiKey ? createAgentMailClient(opts.agentMailApiKey) : null;

  return [
    {
      name: "send_email",
      description: "Send an email from the orchestrator inbox to an agent or external address.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
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
        opts.sseHub.emit({
          type: "agent_email_sent",
          agentId: "planner",
          payload: {
            from: opts.plannerInboxAddress,
            to: args.to as string,
            subject: args.subject as string,
            body: args.body as string,
            messageId: result.messageId,
            threadId: result.threadId,
          },
        });
        return { sent: true, messageId: result.messageId, threadId: result.threadId };
      },
    },
    {
      name: "email_human",
      description: "Send the final itinerary or status update email to the human requester.",
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
          opts.sseHub.emit({
            type: "email_sent",
            agentId: "planner",
            payload: { to: args.to, subject: args.subject, body: args.body, mock: true },
          });
          return { sent: true, mock: true, note: "AgentMail not configured, email logged to SSE" };
        }
        const result = await mailClient.sendMessage({
          from: opts.plannerInboxAddress,
          to: args.to as string,
          subject: args.subject as string,
          body: args.body as string,
        });
        opts.sseHub.emit({
          type: "email_sent",
          agentId: "planner",
          payload: {
            to: args.to,
            subject: args.subject,
            body: args.body,
            messageId: result.messageId,
          },
        });
        return { sent: true, messageId: result.messageId };
      },
    },
    {
      name: "check_orchestrator_inbox",
      description: "Check the orchestrator inbox for emails from agents.",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async () => {
        if (!mailClient || !opts.plannerInboxAddress) {
          return { threads: [], reason: "AgentMail not configured" };
        }
        const threads = await mailClient.listThreads(opts.plannerInboxAddress);
        return {
          threads: threads.map((t) => ({
            threadId: t.id,
            subject: t.subject,
            latestMessage: t.messages[t.messages.length - 1]?.body || "",
            from: t.messages[0]?.from || "",
          })),
        };
      },
    },
  ];
}

// Backward compatibility alias
export const createEmailTools = createOrchestratorEmailTools;
