import { runAgentLoop, createBrowserSession, executeBrowserCode, closeBrowserSession, type SSEHub } from "@kite-stack/agent-core";

export interface RestaurantResult {
  name: string;
  cuisine: string;
  rating: string;
  priceRange: string;
  distance: string;
  address: string;
  notes: string;
}

export interface RestaurantSearchResult {
  restaurants: RestaurantResult[];
  liveViewUrl?: string;
  screenshots: string[];
}

export async function handleFindRestaurants(opts: {
  location: string;
  date: string;
  cuisine?: string;
  weather?: string;
  partySize?: number;
  sseHub: SSEHub;
  openaiApiKey: string;
  firecrawlApiKey?: string;
}): Promise<RestaurantSearchResult> {
  const screenshots: string[] = [];
  let liveViewUrl: string | undefined;
  let sessionId: string | undefined;

  if (opts.firecrawlApiKey) {
    try {
      const session = await createBrowserSession({ apiKey: opts.firecrawlApiKey });
      sessionId = session.id;
      liveViewUrl = session.liveViewUrl;
      opts.sseHub.emit({
        type: "browser_session",
        agentId: "foodie",
        payload: { liveViewUrl, sessionId, status: "active" },
      });
    } catch {
      // Continue without browser
    }
  }

  const tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
  }> = [];

  if (sessionId && opts.firecrawlApiKey) {
    const apiKey = opts.firecrawlApiKey;
    const sid = sessionId;

    tools.push(
      {
        name: "navigate",
        description:
          "Navigate to a URL. Use Yelp search URLs for best results, e.g. " +
          "https://www.yelp.com/search?find_desc=Chinese+food&find_loc=Denver+CO. " +
          "Avoid Google/Bing — their pages don't render in this browser.",
        parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
        execute: async (args: Record<string, unknown>) => {
          const url = String(args.url ?? "");
          const result = await executeBrowserCode({
            apiKey,
            sessionId: sid,
            code: `
              await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 30000 });
              await page.waitForTimeout(5000);
              var _title = await page.title();
              _title;
            `,
          });
          return { title: result.output };
        },
      },
      {
        name: "extract_text",
        description: "Extract visible text from the current page (call after navigate + a brief wait).",
        parameters: { type: "object", properties: { maxLength: { type: "number" } } },
        execute: async (args: Record<string, unknown>) => {
          const maxLen = Math.min(Number(args.maxLength) || 5000, 8000);
          const result = await executeBrowserCode({
            apiKey,
            sessionId: sid,
            code: `
              await page.waitForTimeout(2000);
              var _text = await page.evaluate(() => {
                var t = document.body.innerText || document.body.textContent || '';
                return t.replace(/\\s+/g, ' ').trim().substring(0, ${maxLen});
              });
              _text;
            `,
          });
          return { text: result.output };
        },
      },
      {
        name: "scroll_down",
        description: "Scroll down to load more restaurant listings (Yelp uses lazy loading).",
        parameters: { type: "object", properties: { times: { type: "number" } } },
        execute: async (args: Record<string, unknown>) => {
          const n = Math.min(Number(args.times) || 3, 6);
          const result = await executeBrowserCode({
            apiKey,
            sessionId: sid,
            code: `
              for (let i = 0; i < ${n}; i++) {
                await page.evaluate(() => window.scrollBy(0, window.innerHeight));
                await page.waitForTimeout(1500);
              }
              var _h = await page.evaluate(() => document.body.scrollHeight);
              String(_h);
            `,
          });
          return { scrollHeight: result.output };
        },
      },
      {
        name: "screenshot",
        description: "Take a screenshot of the current page for debugging.",
        parameters: { type: "object", properties: {} },
        execute: async () => {
          const result = await executeBrowserCode({
            apiKey,
            sessionId: sid,
            code: `var _s = await page.screenshot({ encoding: 'base64' }); _s;`,
          });
          if (result.screenshot) screenshots.push(result.screenshot);
          return { captured: true };
        },
      }
    );
  }

  const weatherContext = opts.weather
    ? `\nCurrent weather: ${opts.weather}. Prefer indoor seating options.`
    : "";

  const systemPrompt = `You are a restaurant research agent. Find dining options matching the request.

## Browser strategy (if you have browser tools)
1. Navigate to a Yelp search URL. Examples:
   - https://www.yelp.com/search?find_desc=chinese+restaurants&find_loc=Denver+CO
   - https://www.yelp.com/search?find_desc=mexican+restaurants&find_loc=Denver+CO
2. Call extract_text to read the listings (up to 5000 chars).
3. If the page seems empty, call scroll_down then extract_text again.
4. Repeat for each cuisine type requested.

## Fallback (if browser unavailable or returns blank)
Use your training knowledge to list well-known restaurants. Be specific — include real
addresses, realistic price ranges, and hours. Mark these as "knowledge-based (verify on Maps)".

## Output format
Return ONLY a JSON object:
{
  "restaurants": [
    {
      "name": "...",
      "cuisine": "Chinese|Mexican|...",
      "rating": "4.2",
      "priceRange": "$10-15/person",
      "distance": "0.8 mi from venue",
      "address": "1234 Main St, Denver, CO",
      "notes": "Known for X; open until midnight; good for groups"
    }
  ]
}
Include 6-10 results total (mix of cuisines if requested), with at least 1 late-night option (open past 10 PM).${weatherContext}`;

  const result = await runAgentLoop({
    model: "gpt-5.2",
    systemPrompt,
    userMessage:
      `Find restaurants near "${opts.location}" for ${opts.date}.` +
      (opts.cuisine ? ` Preferred cuisine: ${opts.cuisine}.` : "") +
      (opts.partySize ? ` Party size: ${opts.partySize}.` : "") +
      ` Budget: $10-15/person. Include Chinese and Mexican options. Include at least 1 late-night spot.`,
    tools,
    onThought: (text) => {
      opts.sseHub.emit({ type: "llm_thinking", agentId: "foodie", payload: { text } });
    },
    onToolCall: (name, args) => {
      opts.sseHub.emit({ type: "llm_tool_call", agentId: "foodie", payload: { tool: name, args } });
    },
    apiKey: opts.openaiApiKey,
  });

  if (sessionId && opts.firecrawlApiKey) {
    closeBrowserSession({ apiKey: opts.firecrawlApiKey, sessionId }).catch(() => {});
    opts.sseHub.emit({
      type: "browser_session",
      agentId: "foodie",
      payload: { sessionId, status: "closed" },
    });
  }

  let restaurants: RestaurantResult[] = [];
  try {
    // Strip markdown fences if the model wrapped the JSON
    const raw = result.finalAnswer.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as { restaurants?: RestaurantResult[] };
    restaurants = parsed.restaurants || [];
  } catch {
    restaurants = [
      {
        name: "See notes",
        cuisine: "Various",
        rating: "N/A",
        priceRange: "$10-15",
        distance: "Near venue",
        address: opts.location,
        notes: result.finalAnswer,
      },
    ];
  }

  return { restaurants, liveViewUrl, screenshots };
}
