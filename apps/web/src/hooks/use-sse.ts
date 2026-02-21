"use client";

import { useEffect, useRef, useCallback } from "react";

export interface SSEMessage {
  type: string;
  agentId: string;
  payload: Record<string, unknown>;
  runId?: string;
  offsetMs?: number;
}

export function useSSE(url: string, onMessage: (msg: SSEMessage) => void) {
  const esRef = useRef<EventSource | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback((targetUrl: string) => {
    if (esRef.current) {
      esRef.current.close();
    }

    const es = new EventSource(targetUrl);
    esRef.current = es;

    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as SSEMessage;
        onMessageRef.current(data);
      } catch { /* ignore parse errors */ }
    };

    const eventTypes = [
      "email_received", "email_sent", "llm_thinking", "llm_tool_call",
      "browser_session", "browser_screenshot", "enforcement_step",
      "payment_start", "payment_complete", "payment_failed",
      "wallet_update", "agent_status", "error", "replay_complete",
      // Dynamic agent events
      "agent_spawning", "agent_spawned", "agent_plan_created",
      "orchestrator_phase", "agent_results",
      // Email-chain architecture events
      "agent_email_sent", "agent_email_received", "agent_inbox_created",
      "orchestrator_decision",
    ];

    for (const type of eventTypes) {
      es.addEventListener(type, handler);
    }

    es.onerror = () => {
      es.close();
      setTimeout(() => connect(targetUrl), 3000);
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cleanup = connect(url);
    return cleanup;
  }, [url, connect]);

  const switchUrl = useCallback((newUrl: string) => {
    connect(newUrl);
  }, [connect]);

  return { switchUrl };
}
