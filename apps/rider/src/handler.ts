import { runAgentLoop, createBrowserSession, executeBrowserCode, closeBrowserSession, type SSEHub } from "@kite-stack/agent-core";

export interface RideResult {
  type: string;
  provider: string;
  estimatedPrice: string;
  estimatedTime: string;
  notes: string;
}

export interface RideSearchResult {
  rides: RideResult[];
  liveViewUrl?: string;
  screenshots: string[];
}

export async function handleFindRides(opts: {
  origin: string;
  destination: string;
  date: string;
  preferences?: string;
  sseHub: SSEHub;
  openaiApiKey: string;
  firecrawlApiKey?: string;
}): Promise<RideSearchResult> {
  const screenshots: string[] = [];
  let liveViewUrl: string | undefined;
  let sessionId: string | undefined;

  // Create browser session if Firecrawl is configured
  if (opts.firecrawlApiKey) {
    try {
      const session = await createBrowserSession({ apiKey: opts.firecrawlApiKey });
      sessionId = session.id;
      liveViewUrl = session.liveViewUrl;
      opts.sseHub.emit({
        type: "browser_session",
        agentId: "rider",
        payload: { liveViewUrl, sessionId, status: "active" },
      });
    } catch {
      // Continue without browser
    }
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
          const result = await executeBrowserCode({
            apiKey, sessionId: sid,
            code: `await page.goto('${args.url}', { waitUntil: 'networkidle', timeout: 15000 }); var _title = await page.title(); _title;`,
          });
          return { title: result.output };
        },
      },
      {
        name: "search_text",
        description: "Type text into the currently focused search box and press Enter",
        parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        execute: async (args: Record<string, unknown>) => {
          const result = await executeBrowserCode({
            apiKey, sessionId: sid,
            code: `await page.keyboard.type('${args.text}'); await page.keyboard.press('Enter'); await page.waitForTimeout(3000); var _text = await page.evaluate(() => document.body.innerText.substring(0, 2000)); _text;`,
          });
          return { pageText: result.output };
        },
      },
      {
        name: "screenshot",
        description: "Take a screenshot of the current page",
        parameters: { type: "object", properties: {} },
        execute: async () => {
          const result = await executeBrowserCode({
            apiKey, sessionId: sid,
            code: `var _screenshot = await page.screenshot({ encoding: 'base64' }); _screenshot;`,
          });
          if (result.screenshot) screenshots.push(result.screenshot);
          return { captured: true };
        },
      },
      {
        name: "extract_text",
        description: "Extract visible text from the current page",
        parameters: { type: "object", properties: { maxLength: { type: "number" } } },
        execute: async (args: Record<string, unknown>) => {
          const maxLen = (args.maxLength as number) || 3000;
          const result = await executeBrowserCode({
            apiKey, sessionId: sid,
            code: `var _text = await page.evaluate(() => document.body.innerText); _text.substring(0, ${maxLen});`,
          });
          return { text: result.output };
        },
      }
    );
  }

  const result = await runAgentLoop({
    model: "gpt-5.2",
    systemPrompt: `You are a transportation research agent. Given origin, destination, and date, find ride options.
If you have browser tools, use them to search Google Maps for distance/travel time, then check ride estimation sites.
If no browser tools are available, use your knowledge to estimate ride options.
Always return a JSON object with a "rides" array containing objects with: type, provider, estimatedPrice, estimatedTime, notes.`,
    userMessage: `Find transportation from "${opts.origin}" to "${opts.destination}" on ${opts.date}.${opts.preferences ? ` Preferences: ${opts.preferences}` : ""}`,
    tools,
    onThought: (text) => {
      opts.sseHub.emit({ type: "llm_thinking", agentId: "rider", payload: { text } });
    },
    onToolCall: (name, args) => {
      opts.sseHub.emit({ type: "llm_tool_call", agentId: "rider", payload: { tool: name, args } });
    },
    apiKey: opts.openaiApiKey,
  });

  // Cleanup browser session
  if (sessionId && opts.firecrawlApiKey) {
    closeBrowserSession({ apiKey: opts.firecrawlApiKey, sessionId }).catch(() => {});
    opts.sseHub.emit({ type: "browser_session", agentId: "rider", payload: { sessionId, status: "closed" } });
  }

  // Parse rides from LLM response
  let rides: RideResult[] = [];
  try {
    const parsed = JSON.parse(result.finalAnswer);
    rides = parsed.rides || [];
  } catch {
    rides = [{
      type: "rideshare",
      provider: "Uber",
      estimatedPrice: "$20-30",
      estimatedTime: "25-35 min",
      notes: result.finalAnswer,
    }];
  }

  return { rides, liveViewUrl, screenshots };
}
