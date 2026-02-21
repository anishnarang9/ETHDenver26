import OpenAI from "openai";

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface LLMCallResult {
  thoughts: string[];
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    result: unknown;
  }>;
  finalAnswer: string;
}

export async function runAgentLoop(opts: {
  model: string;
  systemPrompt: string;
  userMessage: string;
  tools: AgentTool[];
  onThought?: (text: string) => void;
  onToolCall?: (name: string, args: unknown) => void;
  maxIterations?: number;
  apiKey?: string;
  signal?: AbortSignal;
}): Promise<LLMCallResult> {
  const client = new OpenAI({ apiKey: opts.apiKey || process.env.OPENAI_API_KEY });
  const thoughts: string[] = [];
  const toolCallResults: LLMCallResult["toolCalls"] = [];
  const maxIter = opts.maxIterations ?? 10;

  const openaiTools: OpenAI.ChatCompletionTool[] = opts.tools.map(t => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: opts.userMessage },
  ];

  for (let i = 0; i < maxIter; i++) {
    if (opts.signal?.aborted) {
      throw new Error("Agent killed");
    }

    const response = await client.chat.completions.create({
      model: opts.model,
      messages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
    });

    const choice = response.choices[0];
    if (!choice) break;

    const msg = choice.message;
    messages.push(msg);

    if (msg.content) {
      thoughts.push(msg.content);
      opts.onThought?.(msg.content);
    }

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { thoughts, toolCalls: toolCallResults, finalAnswer: msg.content || "" };
    }

    for (const tc of msg.tool_calls) {
      if (opts.signal?.aborted) {
        throw new Error("Agent killed");
      }
      const tool = opts.tools.find(t => t.name === tc.function.name);
      const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      opts.onToolCall?.(tc.function.name, args);

      let result: unknown;
      try {
        result = tool ? await tool.execute(args) : { error: `Unknown tool: ${tc.function.name}` };
      } catch (err) {
        result = { error: (err as Error).message };
      }

      toolCallResults.push({ name: tc.function.name, args, result });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: typeof result === "string" ? result : JSON.stringify(result),
      });
    }
  }

  return { thoughts, toolCalls: toolCallResults, finalAnswer: thoughts[thoughts.length - 1] || "" };
}
