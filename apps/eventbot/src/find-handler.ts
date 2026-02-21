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

/** Escape a string for safe interpolation into Puppeteer code */
function esc(value: unknown): string {
  return JSON.stringify(String(value ?? ""));
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
      const session = await createBrowserSession({ apiKey: opts.firecrawlApiKey, ttl: 600 });
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
        description: "Navigate to a URL in the browser. Use this to go to lu.ma pages.",
        parameters: { type: "object", properties: { url: { type: "string", description: "Full URL to navigate to" } }, required: ["url"] },
        execute: async (args: Record<string, unknown>) => {
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `
            await page.goto(${esc(args.url)}, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(4000);
            var _title = await page.title();
            _title;
          ` });
          return { title: result.output };
        },
      },
      {
        name: "search_text",
        description: "Type text into a focused search box and press Enter. First click a search input before using this.",
        parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        execute: async (args: Record<string, unknown>) => {
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `
            await page.keyboard.type(${esc(args.text)});
            await page.keyboard.press('Enter');
            await page.waitForTimeout(4000);
            var _text = await page.evaluate(() => document.body.innerText.substring(0, 4000));
            _text;
          ` });
          return { pageText: result.output };
        },
      },
      {
        name: "click_element",
        description: "Click an element by CSS selector or by its visible text content",
        parameters: {
          type: "object",
          properties: {
            selector: { type: "string", description: "CSS selector to click" },
            text: { type: "string", description: "Visible text content to find and click" },
          },
        },
        execute: async (args: Record<string, unknown>) => {
          const code = args.selector
            ? `await page.click(${esc(args.selector)}); await page.waitForTimeout(2000); 'clicked';`
            : `
              await page.evaluate((t) => {
                const el = [...document.querySelectorAll('a, button, [role="button"], div[class*="event"], div[class*="card"]')]
                  .find(e => e.textContent?.toLowerCase().includes(t.toLowerCase()));
                if (el) el.click();
              }, ${esc(args.text)});
              await page.waitForTimeout(2000);
              'clicked';
            `;
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code });
          return { result: result.output };
        },
      },
      {
        name: "scroll_down",
        description: "Scroll down the page to load more content. Lu.ma lazy-loads events — call this multiple times to reveal more events.",
        parameters: { type: "object", properties: { times: { type: "number", description: "Number of scroll increments (default 3)" } } },
        execute: async (args: Record<string, unknown>) => {
          const n = Math.min(Number(args.times) || 3, 10);
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `
            for (let i = 0; i < ${n}; i++) {
              await page.evaluate(() => window.scrollBy(0, window.innerHeight));
              await page.waitForTimeout(1500);
            }
            var _h = await page.evaluate(() => ({
              scrollY: window.scrollY,
              docHeight: document.body.scrollHeight,
              innerHeight: window.innerHeight,
            }));
            JSON.stringify(_h);
          ` });
          return { scrollInfo: result.output };
        },
      },
      {
        name: "extract_text",
        description: "Extract visible text from the current page",
        parameters: { type: "object", properties: { maxLength: { type: "number", description: "Max chars to extract (default 5000)" } } },
        execute: async (args: Record<string, unknown>) => {
          const maxLen = Math.min(Number(args.maxLength) || 5000, 8000);
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `
            var _text = await page.evaluate(() => document.body.innerText);
            _text.substring(0, ${maxLen});
          ` });
          return { text: result.output };
        },
      },
      {
        name: "extract_links",
        description: "Extract all links from the current page, optionally filtered by a keyword. Useful for finding event URLs on lu.ma calendar pages.",
        parameters: { type: "object", properties: { filter: { type: "string", description: "Optional keyword to filter links by href or text" } } },
        execute: async (args: Record<string, unknown>) => {
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `
            var _links = await page.evaluate((filterStr) => {
              const all = Array.from(document.querySelectorAll('a[href]'));
              return all
                .map(a => ({ href: a.href, text: (a.textContent || '').trim().substring(0, 120) }))
                .filter(l => l.text.length > 0)
                .filter(l => !filterStr || l.href.toLowerCase().includes(filterStr.toLowerCase()) || l.text.toLowerCase().includes(filterStr.toLowerCase()))
                .slice(0, 60);
            }, ${esc(args.filter || "")});
            JSON.stringify(_links);
          ` });
          return { links: result.output };
        },
      },
      {
        name: "screenshot",
        description: "Take a screenshot of the current page",
        parameters: { type: "object", properties: {} },
        execute: async () => {
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `var _s = await page.screenshot({ encoding: 'base64' }); _s;` });
          if (result.screenshot) screenshots.push(result.screenshot);
          return { captured: true };
        },
      },
    );
  }

  const result = await runAgentLoop({
    model: "gpt-5.2",
    systemPrompt: `You are an event discovery agent specializing in finding tech, crypto, and AI events.

## Your primary source: lu.ma (Luma)
- The ETHDenver side-events calendar is at: https://lu.ma/ethdenver
- lu.ma is a React single-page app — pages load dynamically.
- After navigating, always wait for content to render, then extract_text or extract_links.
- Events are lazy-loaded — use scroll_down 3-5 times to reveal more events.
- Each event card on the calendar links to a detail page like https://lu.ma/<event-slug>.

## Step-by-step strategy
1. navigate to https://lu.ma/ethdenver
2. extract_text to see what loaded (the calendar page lists events)
3. scroll_down several times to load more events
4. extract_links with filter "lu.ma" to get individual event URLs
5. For the most interesting events, navigate to each event page and extract_text for details
6. Compile all findings into JSON

## Output format
Return a JSON object:
{
  "events": [
    {
      "name": "Event Title",
      "date": "Feb 25, 2026",
      "time": "6:00 PM MST",
      "location": "Venue, Denver",
      "url": "https://lu.ma/event-slug",
      "description": "Brief description",
      "registrationOpen": true
    }
  ]
}

Be thorough — find as many events as possible. If lu.ma/ethdenver doesn't work, try https://lu.ma/denver or search lu.ma for "ETHDenver".`,
    userMessage: `Find events in "${opts.location}" during ${opts.dateRange}. Search: "${opts.query}".${opts.interests ? ` Interests: ${opts.interests}` : ""}`,
    tools,
    onThought: (text) => { opts.sseHub.emit({ type: "llm_thinking", agentId: "eventbot", payload: { text } }); },
    onToolCall: (name, args) => { opts.sseHub.emit({ type: "llm_tool_call", agentId: "eventbot", payload: { tool: name, args } }); },
    apiKey: opts.openaiApiKey,
    maxIterations: 15,
  });

  if (sessionId && opts.firecrawlApiKey) {
    closeBrowserSession({ apiKey: opts.firecrawlApiKey, sessionId }).catch(() => {});
    opts.sseHub.emit({ type: "browser_session", agentId: "eventbot", payload: { sessionId, status: "closed" } });
  }

  let events: EventResult[] = [];
  try {
    // Handle LLM wrapping JSON in markdown code fences
    let raw = result.finalAnswer;
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) raw = fenceMatch[1]!;
    const parsed = JSON.parse(raw);
    events = parsed.events || [];
  } catch {
    events = [{ name: "Event Search Results", date: "", time: "", location: opts.location, url: "", description: result.finalAnswer, registrationOpen: false }];
  }
  return { events, liveViewUrl, screenshots };
}
