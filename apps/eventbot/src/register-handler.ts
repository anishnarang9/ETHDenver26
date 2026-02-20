import { runAgentLoop, createBrowserSession, executeBrowserCode, closeBrowserSession, type SSEHub } from "@kite-stack/agent-core";

export interface RegistrationResult {
  success: boolean;
  eventName: string;
  eventUrl: string;
  confirmationScreenshot?: string;
  message: string;
}

export async function handleRegisterEvent(opts: {
  eventUrl: string;
  name: string;
  email: string;
  sseHub: SSEHub;
  openaiApiKey: string;
  firecrawlApiKey?: string;
}): Promise<RegistrationResult> {
  let liveViewUrl: string | undefined;
  let sessionId: string | undefined;
  let confirmationScreenshot: string | undefined;

  if (!opts.firecrawlApiKey) {
    return { success: false, eventName: "", eventUrl: opts.eventUrl, message: "Firecrawl API key required for registration" };
  }

  try {
    const session = await createBrowserSession({ apiKey: opts.firecrawlApiKey, ttl: 600 });
    sessionId = session.id;
    liveViewUrl = session.liveViewUrl;
    opts.sseHub.emit({ type: "browser_session", agentId: "eventbot", payload: { liveViewUrl, sessionId, status: "active" } });
  } catch (err) {
    return { success: false, eventName: "", eventUrl: opts.eventUrl, message: `Failed to create browser session: ${(err as Error).message}` };
  }

  const apiKey = opts.firecrawlApiKey;
  const sid = sessionId;

  const tools = [
    {
      name: "navigate",
      description: "Navigate to a URL",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
      execute: async (args: Record<string, unknown>) => {
        const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `await page.goto('${args.url}', { waitUntil: 'networkidle2', timeout: 20000 }); const title = await page.title(); title;` });
        return { title: result.output };
      },
    },
    {
      name: "click",
      description: "Click an element by CSS selector or text content",
      parameters: { type: "object", properties: { selector: { type: "string" }, text: { type: "string" } } },
      execute: async (args: Record<string, unknown>) => {
        const code = args.selector
          ? `await page.click('${args.selector}'); await page.waitForTimeout(2000); 'clicked';`
          : `await page.evaluate((t) => { const el = [...document.querySelectorAll('a, button, [role="button"], input[type="submit"]')].find(e => e.textContent?.toLowerCase().includes(t.toLowerCase())); if (el) el.click(); }, '${args.text}'); await page.waitForTimeout(2000); 'clicked';`;
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
          const identifier = '${args.identifier}';
          const value = '${args.value}';
          let filled = false;
          // Try by CSS selector
          try { const el = await page.$(identifier); if (el) { await el.click({ clickCount: 3 }); await el.type(value); filled = true; } } catch {}
          // Try by placeholder
          if (!filled) { try { const el = await page.$(\`input[placeholder*="\${identifier}" i], textarea[placeholder*="\${identifier}" i]\`); if (el) { await el.click({ clickCount: 3 }); await el.type(value); filled = true; } } catch {} }
          // Try by name
          if (!filled) { try { const el = await page.$(\`input[name*="\${identifier}" i], textarea[name*="\${identifier}" i]\`); if (el) { await el.click({ clickCount: 3 }); await el.type(value); filled = true; } } catch {} }
          // Try by label
          if (!filled) { try { await page.evaluate((id, val) => { const labels = document.querySelectorAll('label'); for (const label of labels) { if (label.textContent?.toLowerCase().includes(id.toLowerCase())) { const input = label.querySelector('input, textarea') || document.getElementById(label.htmlFor || ''); if (input) { (input as HTMLInputElement).value = val; input.dispatchEvent(new Event('input', { bubbles: true })); return; } } } }, identifier, value); filled = true; } catch {} }
          filled ? 'filled' : 'not found';
        `;
        const result = await executeBrowserCode({ apiKey, sessionId: sid, code });
        return { result: result.output };
      },
    },
    {
      name: "extract_text",
      description: "Extract visible text from the current page",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `const text = await page.evaluate(() => document.body.innerText); text.substring(0, 5000);` });
        return { text: result.output };
      },
    },
    {
      name: "screenshot",
      description: "Take a screenshot",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `const s = await page.screenshot({ encoding: 'base64' }); s;` });
        if (result.screenshot) confirmationScreenshot = result.screenshot;
        return { captured: true };
      },
    },
    {
      name: "get_form_fields",
      description: "List all visible form fields on the page",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        const result = await executeBrowserCode({ apiKey, sessionId: sid, code: `const fields = await page.evaluate(() => { const inputs = document.querySelectorAll('input, textarea, select'); return Array.from(inputs).map(i => ({ tag: i.tagName, type: (i as HTMLInputElement).type, name: (i as HTMLInputElement).name, placeholder: (i as HTMLInputElement).placeholder, label: i.closest('label')?.textContent?.trim() || '', visible: i.offsetParent !== null })).filter(f => f.visible); }); JSON.stringify(fields);` });
        return { fields: result.output };
      },
    },
  ];

  const result = await runAgentLoop({
    model: "gpt-4o",
    systemPrompt: `You are an event registration agent. Your task is to navigate to a Luma event page, find the registration form, and complete registration.

Steps:
1. Navigate to the event URL
2. Find and click the "Register" or "RSVP" button
3. Wait for the form to appear
4. Use get_form_fields to see available fields
5. Fill in the name and email fields using fill_input
6. Click the submit/register button
7. Take a screenshot of the confirmation
8. Return a JSON with: { "success": true/false, "eventName": "...", "message": "..." }

The registrant's name is: ${opts.name}
The registrant's email is: ${opts.email}

Be careful and methodical. If a step fails, try alternative approaches.`,
    userMessage: `Register for the event at: ${opts.eventUrl}`,
    tools,
    onThought: (text) => { opts.sseHub.emit({ type: "llm_thinking", agentId: "eventbot", payload: { text } }); },
    onToolCall: (name, args) => { opts.sseHub.emit({ type: "llm_tool_call", agentId: "eventbot", payload: { tool: name, args } }); },
    apiKey: opts.openaiApiKey,
    maxIterations: 15,
  });

  closeBrowserSession({ apiKey: opts.firecrawlApiKey, sessionId: sid }).catch(() => {});
  opts.sseHub.emit({ type: "browser_session", agentId: "eventbot", payload: { sessionId: sid, status: "closed" } });

  let success = false;
  let eventName = "";
  let message = result.finalAnswer;

  try {
    const parsed = JSON.parse(result.finalAnswer);
    success = parsed.success ?? false;
    eventName = parsed.eventName ?? "";
    message = parsed.message ?? result.finalAnswer;
  } catch { /* use defaults */ }

  return { success, eventName, eventUrl: opts.eventUrl, confirmationScreenshot, message };
}
