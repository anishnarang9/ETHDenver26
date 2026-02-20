export interface BrowserSession {
  id: string;
  liveViewUrl: string;
  cdpUrl: string;
  expiresAt: string;
}

export async function createBrowserSession(opts: {
  apiKey: string;
  ttl?: number;
}): Promise<BrowserSession> {
  const res = await fetch("https://api.firecrawl.dev/v2/browser", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl: opts.ttl ?? 300 }),
  });
  if (!res.ok) throw new Error(`Firecrawl create session failed: ${res.status}`);
  const data = await res.json() as { id: string; liveViewUrl: string; cdpUrl: string; expiresAt: string };
  return data;
}

export async function executeBrowserCode(opts: {
  apiKey: string;
  sessionId: string;
  code: string;
}): Promise<{ output: string; screenshot?: string }> {
  const res = await fetch(`https://api.firecrawl.dev/v2/browser/${opts.sessionId}/execute`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: opts.code }),
  });
  if (!res.ok) throw new Error(`Firecrawl execute failed: ${res.status}`);
  return res.json() as Promise<{ output: string; screenshot?: string }>;
}

export async function closeBrowserSession(opts: {
  apiKey: string;
  sessionId: string;
}): Promise<void> {
  await fetch(`https://api.firecrawl.dev/v2/browser/${opts.sessionId}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${opts.apiKey}` },
  });
}
