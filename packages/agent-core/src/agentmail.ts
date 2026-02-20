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
      return res.json() as Promise<{ address: string; id: string }>;
    },

    async sendMessage(opts) {
      const res = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(opts),
      });
      if (!res.ok) throw new Error(`AgentMail sendMessage failed: ${res.status}`);
      return res.json() as Promise<{ messageId: string; threadId: string }>;
    },

    async listThreads(inboxId) {
      const res = await fetch(`${baseUrl}/inboxes/${inboxId}/threads`, { headers });
      if (!res.ok) throw new Error(`AgentMail listThreads failed: ${res.status}`);
      const data = await res.json() as { threads: Thread[] };
      return data.threads;
    },

    async createWebhook(opts) {
      const res = await fetch(`${baseUrl}/webhooks`, {
        method: "POST",
        headers,
        body: JSON.stringify(opts),
      });
      if (!res.ok) throw new Error(`AgentMail createWebhook failed: ${res.status}`);
      return res.json() as Promise<{ webhookId: string }>;
    },
  };
}
