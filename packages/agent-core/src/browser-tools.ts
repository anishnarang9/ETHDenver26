import { createBrowserSession, executeBrowserCode, closeBrowserSession, type BrowserSession } from "./browser.js";
import type { SSEHub } from "./sse-emitter.js";

export interface BrowserToolsResult {
  tools: BrowserTool[];
  sessionId: string | undefined;
  liveViewUrl: string | undefined;
  screenshots: string[];
  cleanup: () => Promise<void>;
}

export interface BrowserTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Escape a value for safe interpolation into Puppeteer code */
function esc(value: unknown): string {
  return JSON.stringify(String(value ?? ""));
}

export async function createBrowserToolsWithSession(opts: {
  firecrawlApiKey?: string;
  agentId: string;
  sseHub: SSEHub;
  ttl?: number;
}): Promise<BrowserToolsResult> {
  const screenshots: string[] = [];
  let sessionId: string | undefined;
  let liveViewUrl: string | undefined;

  if (opts.firecrawlApiKey) {
    try {
      const session = await createBrowserSession({ apiKey: opts.firecrawlApiKey, ttl: opts.ttl ?? 600 });
      sessionId = session.id;
      liveViewUrl = session.liveViewUrl;
      opts.sseHub.emit({
        type: "browser_session",
        agentId: opts.agentId,
        payload: { liveViewUrl, sessionId, status: "active" },
      });
    } catch {
      // Continue without browser
    }
  }

  const tools: BrowserTool[] = [];

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
            code: `
              await page.goto(${esc(args.url)}, { waitUntil: 'domcontentloaded', timeout: 30000 });
              await page.waitForTimeout(4000);
              var _title = await page.title();
              _title;
            `,
          });
          return { title: result.output };
        },
      },
      {
        name: "click",
        description: "Click an element by CSS selector or text content",
        parameters: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" } } },
        execute: async (args: Record<string, unknown>) => {
          const code = args.selector
            ? `await page.click(${esc(args.selector)}); await page.waitForTimeout(2000); 'clicked';`
            : `
              await page.evaluate((t) => {
                const el = [...document.querySelectorAll('a, button, [role="button"], input[type="submit"]')]
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
        name: "fill_input",
        description: "Fill a text input field by label, placeholder, name attribute, or CSS selector",
        parameters: { type: "object", properties: { identifier: { type: "string" }, value: { type: "string" } }, required: ["identifier", "value"] },
        execute: async (args: Record<string, unknown>) => {
          const code = `
            const identifier = ${esc(args.identifier)};
            const value = ${esc(args.value)};
            let filled = false;
            try { const el = await page.$(identifier); if (el) { await el.click({ clickCount: 3 }); await el.type(value); filled = true; } } catch {}
            if (!filled) { try { const el = await page.$(\`input[placeholder*="\${identifier}" i], textarea[placeholder*="\${identifier}" i]\`); if (el) { await el.click({ clickCount: 3 }); await el.type(value); filled = true; } } catch {} }
            if (!filled) { try { const el = await page.$(\`input[name*="\${identifier}" i], textarea[name*="\${identifier}" i]\`); if (el) { await el.click({ clickCount: 3 }); await el.type(value); filled = true; } } catch {} }
            if (!filled) { try { await page.evaluate((id, val) => { const labels = document.querySelectorAll('label'); for (const label of labels) { if (label.textContent?.toLowerCase().includes(id.toLowerCase())) { const input = label.querySelector('input, textarea') || document.getElementById(label.htmlFor || ''); if (input) { (input as HTMLInputElement).value = val; input.dispatchEvent(new Event('input', { bubbles: true })); return; } } } }, identifier, value); filled = true; } catch {} }
            filled ? 'filled' : 'not found';
          `;
          const result = await executeBrowserCode({ apiKey, sessionId: sid, code });
          return { result: result.output };
        },
      },
      {
        name: "search_text",
        description: "Type text into the currently focused search box and press Enter",
        parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        execute: async (args: Record<string, unknown>) => {
          const result = await executeBrowserCode({
            apiKey, sessionId: sid,
            code: `
              await page.keyboard.type(${esc(args.text)});
              await page.keyboard.press('Enter');
              await page.waitForTimeout(4000);
              var _text = await page.evaluate(() => document.body.innerText.substring(0, 4000));
              _text;
            `,
          });
          return { pageText: result.output };
        },
      },
      {
        name: "scroll_down",
        description: "Scroll down the page to load more content. Useful for infinite-scroll pages like lu.ma.",
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
        parameters: { type: "object", properties: { maxLength: { type: "number" } } },
        execute: async (args: Record<string, unknown>) => {
          const maxLen = Math.min(Number(args.maxLength) || 5000, 8000);
          const result = await executeBrowserCode({
            apiKey, sessionId: sid,
            code: `var _text = await page.evaluate(() => document.body.innerText); _text.substring(0, ${maxLen});`,
          });
          return { text: result.output };
        },
      },
      {
        name: "extract_links",
        description: "Extract all links from the current page, optionally filtered by keyword. Useful for finding event URLs.",
        parameters: { type: "object", properties: { filter: { type: "string", description: "Optional keyword to filter links" } } },
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
          const result = await executeBrowserCode({
            apiKey, sessionId: sid,
            code: `var _s = await page.screenshot({ encoding: 'base64' }); _s;`,
          });
          if (result.screenshot) screenshots.push(result.screenshot);
          opts.sseHub.emit({
            type: "browser_screenshot",
            agentId: opts.agentId,
            payload: { screenshot: result.screenshot },
          });
          return { captured: true };
        },
      },
      {
        name: "get_form_fields",
        description: "List all visible form fields on the page",
        parameters: { type: "object", properties: {} },
        execute: async () => {
          const result = await executeBrowserCode({
            apiKey, sessionId: sid,
            code: `const fields = await page.evaluate(() => { const inputs = document.querySelectorAll('input, textarea, select'); return Array.from(inputs).map(i => ({ tag: i.tagName, type: (i as HTMLInputElement).type, name: (i as HTMLInputElement).name, placeholder: (i as HTMLInputElement).placeholder, label: i.closest('label')?.textContent?.trim() || '', visible: i.offsetParent !== null })).filter(f => f.visible); }); JSON.stringify(fields);`,
          });
          return { fields: result.output };
        },
      },
    );
  }

  const cleanup = async () => {
    if (sessionId && opts.firecrawlApiKey) {
      await closeBrowserSession({ apiKey: opts.firecrawlApiKey, sessionId }).catch(() => {});
      opts.sseHub.emit({
        type: "browser_session",
        agentId: opts.agentId,
        payload: { sessionId, status: "closed" },
      });
    }
  };

  return { tools, sessionId, liveViewUrl, screenshots, cleanup };
}
