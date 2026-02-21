"use client";

import { useCallback, useEffect, useRef } from "react";
import type { SSEMessage } from "../lib/types";

export function useSSE(url: string, onMessage: (msg: SSEMessage) => void) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  const connect = useCallback((targetUrl: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    let source: EventSource;
    try {
      source = new EventSource(targetUrl);
    } catch {
      reconnectTimerRef.current = setTimeout(() => connect(targetUrl), 3000);
      return () => undefined;
    }
    eventSourceRef.current = source;

    const parse = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data) as SSEMessage;
        handlerRef.current(msg);
      } catch {
        // ignore malformed events
      }
    };

    const eventTypes = [
      "email_received",
      "email_sent",
      "agent_email_received",
      "agent_email_sent",
      "agent_spawning",
      "agent_spawned",
      "llm_thinking",
      "llm_tool_call",
      "browser_session",
      "browser_screenshot",
      "enforcement_step",
      "payment_start",
      "payment_complete",
      "payment_failed",
      "wallet_update",
      "agent_status",
      "orchestrator_phase",
      "orchestrator_decision",
      "error",
      "replay_complete",
    ];

    for (const eventType of eventTypes) {
      source.addEventListener(eventType, parse);
    }

    source.onerror = () => {
      source.close();
      reconnectTimerRef.current = setTimeout(() => connect(targetUrl), 3000);
    };

    return () => {
      source.close();
      eventSourceRef.current = null;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const cleanup = connect(url);
    return cleanup;
  }, [url, connect]);

  const switchUrl = useCallback(
    (newUrl: string) => {
      connect(newUrl);
    },
    [connect]
  );

  return { switchUrl };
}
