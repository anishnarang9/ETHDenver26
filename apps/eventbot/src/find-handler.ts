import { runAgentLoop, createBrowserSession, executeBrowserCode, closeBrowserSession, type SSEHub } from "@kite-stack/agent-core";

export interface EventResult {
  name: string;
  date: string;
  time: string;
  location: string;
  url: string;
  description: string;
  registrationOpen: boolean;
}

export interface EventSearchResult {
  events: EventResult[];
  liveViewUrl?: string;
  screenshots: string[];
}

export async function handleFindEvents(opts: {
  query: string;
  location: string;
  dateRange: string;
  interests?: string;
  sseHub: SSEHub;
  openaiApiKey: string;
  firecrawlApiKey?: string;
}): Promise<EventSearchResult> {
  const screenshots: string[] = [];
  let liveViewUrl: string | undefined;
  let sessionId: string | undefined;

  if (opts.firecrawlApiKey) {
    try {
      const session = await createBrowserSession({ apiKey: opts.firecrawlApiKey });
      sessionId = session.id;
      liveViewUrl = session.liveViewUrl;
      opts.sseHub.emit({ type: "browser_session", agentId: "eventbot", payload: { liveViewUrl, sessionId, status: "active" } });
    } catch { /* continue without browser */ }
  }

  const tools = [];
  if (sessionId && opts.firecrawlApiKey) {
    const apiKey = opts.firecrawlApiKey;
    const sid = sessionId;
    tools.push(
      {
        name: "navigate",
        description: "Navigate to a URL in the browser",
        parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
        execute: async (args: Record<string, unknown>) => {
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `await page.goto('${args.url}', { waitUntil: 'networkidle2', timeout: 15000 }); const title = await page.title(); title;` });
          return { title: result.output };
        },
      },
      {
        name: "search_text",
        description: "Type search text and press Enter",
        parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        execute: async (args: Record<string, unknown>) => {
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `await page.keyboard.type('${args.text}'); await page.keyboard.press('Enter'); await page.waitForTimeout(3000); const text = await page.evaluate(() => document.body.innerText.substring(0, 3000)); text;` });
          return { pageText: result.output };
        },
      },
      {
        name: "click_element",
        description: "Click an element matching a CSS selector or containing specific text",
        parameters: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" } }, required: [] },
        execute: async (args: Record<string, unknown>) => {
          const code = args.selector
            ? `await page.click('${args.selector}'); await page.waitForTimeout(2000); 'clicked';`
            : `const els = await page.$$eval('a, button', (els, t) => els.filter(e => e.textContent?.includes(t)).map(e => e.outerHTML), '${args.text}'); if (els.length > 0) { await page.evaluate((t) => { const el = [...document.querySelectorAll('a, button')].find(e => e.textContent?.includes(t)); el?.click(); }, '${args.text}'); } 'clicked';`;
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code });
          return { result: result.output };
        },
      },
      {
        name: "extract_text",
        description: "Extract visible text from the current page",
        parameters: { type: "object", properties: { maxLength: { type: "number" } } },
        execute: async (args: Record<string, unknown>) => {
          const maxLen = (args.maxLength as number) || 4000;
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `const text = await page.evaluate(() => document.body.innerText); text.substring(0, ${maxLen});` });
          return { text: result.output };
        },
      },
      {
        name: "screenshot",
        description: "Take a screenshot of the current page",
        parameters: { type: "object", properties: {} },
        execute: async () => {
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `const s = await page.screenshot({ encoding: 'base64' }); s;` });
          if (result.screenshot) screenshots.push(result.screenshot);
          return { captured: true };
        },
      }
    );
  }

  const result = await runAgentLoop({
    model: "gpt-5.2",
    systemPrompt: `You are an event discovery agent specializing in finding tech/crypto/AI events on lu.ma (Luma) and similar platforms.
Search for events matching the user's interests and date range. Extract event details including name, date, time, location, URL, and whether registration is open.
If you have browser tools, navigate to lu.ma and search directly.
Return a JSON object with an "events" array containing objects with: name, date, time, location, url, description, registrationOpen.`,
    userMessage: `Find events in "${opts.location}" during ${opts.dateRange}. Search: "${opts.query}".${opts.interests ? ` Interests: ${opts.interests}` : ""}`,
    tools,
    onThought: (text) => { opts.sseHub.emit({ type: "llm_thinking", agentId: "eventbot", payload: { text } }); },
    onToolCall: (name, args) => { opts.sseHub.emit({ type: "llm_tool_call", agentId: "eventbot", payload: { tool: name, args } }); },
    apiKey: opts.openaiApiKey,
  });

  if (sessionId && opts.firecrawlApiKey) {
    closeBrowserSession({ apiKey: opts.firecrawlApiKey, sessionId }).catch(() => {});
    opts.sseHub.emit({ type: "browser_session", agentId: "eventbot", payload: { sessionId, status: "closed" } });
  }

  let events: EventResult[] = [];
  try { const parsed = JSON.parse(result.finalAnswer); events = parsed.events || []; } catch {
    events = [{ name: "Event", date: "", time: "", location: opts.location, url: "", description: result.finalAnswer, registrationOpen: false }];
  }
  return { events, liveViewUrl, screenshots };
}
