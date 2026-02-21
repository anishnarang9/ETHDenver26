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
        description: "Type text into a search box and press Enter",
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

  const weatherContext = opts.weather ? `\nCurrent weather: ${opts.weather}. Consider indoor vs outdoor seating accordingly.` : "";

  const result = await runAgentLoop({
    model: "gpt-5.2",
    systemPrompt: `You are a restaurant research agent. Given a location and preferences, find the best dining options.
If you have browser tools, search Yelp and Google Maps for restaurants.${weatherContext}
Consider ratings, distance, price range, cuisine type, and hours of operation.
Always return a JSON object with a "restaurants" array containing objects with: name, cuisine, rating, priceRange, distance, address, notes.`,
    userMessage: `Find restaurants near "${opts.location}" for ${opts.date}.${opts.cuisine ? ` Preferred cuisine: ${opts.cuisine}` : ""}${opts.partySize ? ` Party size: ${opts.partySize}` : ""}`,
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
    opts.sseHub.emit({ type: "browser_session", agentId: "foodie", payload: { sessionId, status: "closed" } });
  }

  let restaurants: RestaurantResult[] = [];
  try {
    const parsed = JSON.parse(result.finalAnswer);
    restaurants = parsed.restaurants || [];
  } catch {
    restaurants = [{
      name: "Recommended Restaurant",
      cuisine: "Various",
      rating: "4.5",
      priceRange: "$$$",
      distance: "Nearby",
      address: opts.location,
      notes: result.finalAnswer,
    }];
  }

  return { restaurants, liveViewUrl, screenshots };
}
