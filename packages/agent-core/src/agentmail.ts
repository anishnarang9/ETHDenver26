export interface Thread {
  id: string;
  subject: string;
  messages: Array<{
    id: string;
    from: string;
    to: string;
    subject: string;
    body: string;
    createdAt: string;
  }>;
}

export interface AgentMailClient {
  createInbox(username: string): Promise<{ address: string; id: string }>;
  sendMessage(opts: {
    from: string;
    to: string;
    subject: string;
    body: string;
    inReplyTo?: string;
  }): Promise<{ messageId: string; threadId: string }>;
  listThreads(inboxId: string): Promise<Thread[]>;
  createWebhook(opts: {
    url: string;
    inboxId: string;
    events: string[];
  }): Promise<{ webhookId: string }>;
}

export function createAgentMailClient(apiKey: string): AgentMailClient {
  const baseUrl = "https://api.agentmail.to/v0";
  const headers = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  return {
    async createInbox(username) {
      const res = await fetch(`${baseUrl}/inboxes`, {
        method: "POST",
        headers,
        body: JSON.stringify({ username }),
      });
      if (!res.ok) throw new Error(`AgentMail createInbox failed: ${res.status}`);
      const data = await res.json() as { inbox_id: string };
      // inbox_id IS the email address (e.g. "username@agentmail.to")
      return { address: data.inbox_id, id: data.inbox_id };
    },

    async sendMessage(opts) {
      // API: POST /v0/inboxes/{inbox_id}/messages/send
      // "from" is the inbox_id (email address) of the sender
      const encodedFrom = encodeURIComponent(opts.from);
      const res = await fetch(`${baseUrl}/inboxes/${encodedFrom}/messages/send`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: [opts.to],
          subject: opts.subject,
          text: opts.body,
          ...(opts.inReplyTo ? { headers: { "In-Reply-To": opts.inReplyTo } } : {}),
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`AgentMail sendMessage failed: ${res.status} ${errBody}`);
      }
      const data = await res.json() as { message_id: string; thread_id: string };
      return { messageId: data.message_id, threadId: data.thread_id };
    },

    async listThreads(inboxId) {
      const encodedId = encodeURIComponent(inboxId);
      const res = await fetch(`${baseUrl}/inboxes/${encodedId}/threads`, { headers });
      if (!res.ok) throw new Error(`AgentMail listThreads failed: ${res.status}`);
      const data = await res.json() as {
        threads: Array<{
          thread_id: string;
          subject: string;
          preview: string;
          senders: string[];
          recipients: string[];
          timestamp: string;
          message_count: number;
        }>;
      };
      // Map to our Thread interface (lightweight — no full message bodies)
      return data.threads.map((t) => ({
        id: t.thread_id,
        subject: t.subject || "",
        messages: [{
          id: t.thread_id,
          from: t.senders?.[0] || "",
          to: t.recipients?.[0] || "",
          subject: t.subject || "",
          body: t.preview || "",
          createdAt: t.timestamp || "",
        }],
      }));
    },

    async createWebhook(opts) {
      // API: POST /v0/webhooks
      // Body: { url, eventTypes, inboxIds? }
      const res = await fetch(`${baseUrl}/webhooks`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: opts.url,
          event_types: opts.events,
          inbox_ids: [opts.inboxId],
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`AgentMail createWebhook failed: ${res.status} ${errBody}`);
      }
      const data = await res.json() as { webhook_id: string };
      return { webhookId: data.webhook_id };
    },
  };
}
