"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import { useSSE } from "../hooks/use-sse";
import type {
  BrowserPanelState,
  EmailEvent,
  EnforcementStep,
  SSEMessage,
  TransactionEvent,
} from "./types";

interface SSEState {
  emails: EmailEvent[];
  browsers: Record<string, BrowserPanelState>;
  enforcementSteps: EnforcementStep[];
  transactions: TransactionEvent[];
  thoughts: Record<string, string>;
  agentStatuses: Record<string, string>;
  currentRunId?: string;
}

type SSEAction =
  | { type: "EMAIL_RECEIVED"; payload: SSEMessage }
  | { type: "EMAIL_SENT"; payload: SSEMessage }
  | { type: "BROWSER_SESSION"; payload: SSEMessage }
  | { type: "LLM_THINKING"; payload: SSEMessage }
  | { type: "ENFORCEMENT_STEP"; payload: SSEMessage }
  | { type: "PAYMENT_START"; payload: SSEMessage }
  | { type: "PAYMENT_COMPLETE"; payload: SSEMessage }
  | { type: "PAYMENT_FAILED"; payload: SSEMessage }
  | { type: "AGENT_STATUS"; payload: SSEMessage }
  | { type: "MERGE_ENFORCEMENT"; steps: EnforcementStep[] }
  | { type: "RESET" };

const initialState: SSEState = {
  emails: [],
  browsers: {
    rider: { agentId: "rider", status: "standby" },
    foodie: { agentId: "foodie", status: "standby" },
    eventbot: { agentId: "eventbot", status: "standby" },
  },
  enforcementSteps: [],
  transactions: [],
  thoughts: {},
  agentStatuses: {},
};

function reducer(state: SSEState, action: SSEAction): SSEState {
  switch (action.type) {
    case "EMAIL_RECEIVED":
    case "EMAIL_SENT": {
      const p = action.payload.payload;
      const item: EmailEvent = {
        id: `mail-${Date.now()}-${Math.random()}`,
        from: (p.from as string) || action.payload.agentId,
        to: p.to as string,
        subject: (p.subject as string) || "",
        body: (p.body as string) || "",
        timestamp: new Date().toISOString(),
        agentId: (action.payload.agentId as EmailEvent["agentId"]) || "planner",
      };
      return { ...state, emails: [...state.emails, item] };
    }
    case "BROWSER_SESSION": {
      const p = action.payload.payload;
      const agentId = action.payload.agentId;
      return {
        ...state,
        browsers: {
          ...state.browsers,
          [agentId]: {
            agentId: agentId as BrowserPanelState["agentId"],
            liveViewUrl: (p.liveViewUrl as string) || state.browsers[agentId]?.liveViewUrl,
            status: (p.status as BrowserPanelState["status"]) || "active",
            sessionId: p.sessionId as string,
          },
        },
      };
    }
    case "LLM_THINKING":
      return {
        ...state,
        thoughts: {
          ...state.thoughts,
          [action.payload.agentId]: (action.payload.payload.text as string) || "",
        },
      };
    case "ENFORCEMENT_STEP": {
      const p = action.payload.payload;
      const step: EnforcementStep = {
        step: (p.step as number) || state.enforcementSteps.length + 1,
        name: (p.name as string) || (p.eventType as string) || "Unknown",
        status: (p.status as EnforcementStep["status"]) || "pass",
        detail: p.detail as string,
      };
      return { ...state, enforcementSteps: [...state.enforcementSteps, step] };
    }
    case "PAYMENT_START": {
      const p = action.payload.payload;
      const tx: TransactionEvent = {
        id: `tx-${Date.now()}-${Math.random()}`,
        from: "planner",
        to: (p.target as string) || "service",
        amount: (p.amount as string) || "0",
        method: (p.method as string) || "pending",
        status: "pending",
        timestamp: new Date().toISOString(),
      };
      return { ...state, transactions: [...state.transactions, tx] };
    }
    case "PAYMENT_COMPLETE": {
      const p = action.payload.payload;
      const txs = [...state.transactions];
      const pending = [...txs].reverse().find((tx) => tx.status === "pending");
      if (pending) {
        pending.status = "complete";
        pending.txHash = p.txHash as string;
        pending.amount = (p.amount as string) || pending.amount;
        pending.method = (p.method as string) || pending.method;
      }
      return { ...state, transactions: txs };
    }
    case "PAYMENT_FAILED": {
      const txs = [...state.transactions];
      const pending = [...txs].reverse().find((tx) => tx.status === "pending");
      if (pending) {
        pending.status = "failed";
      }
      return { ...state, transactions: txs };
    }
    case "AGENT_STATUS":
      return {
        ...state,
        agentStatuses: {
          ...state.agentStatuses,
          [action.payload.agentId]: (action.payload.payload.status as string) || "idle",
        },
      };
    case "MERGE_ENFORCEMENT":
      return { ...state, enforcementSteps: action.steps };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

const SSEContext = createContext<{
  state: SSEState;
  dispatch: React.Dispatch<SSEAction>;
  switchUrl: (url: string) => void;
}>({
  state: initialState,
  dispatch: () => undefined,
  switchUrl: () => undefined,
});

export function SSEProvider({ url, children }: { url: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const onMessage = useCallback((msg: SSEMessage) => {
    const map: Record<string, SSEAction["type"]> = {
      email_received: "EMAIL_RECEIVED",
      email_sent: "EMAIL_SENT",
      browser_session: "BROWSER_SESSION",
      llm_thinking: "LLM_THINKING",
      enforcement_step: "ENFORCEMENT_STEP",
      payment_start: "PAYMENT_START",
      payment_complete: "PAYMENT_COMPLETE",
      payment_failed: "PAYMENT_FAILED",
      agent_status: "AGENT_STATUS",
    };

    const type = map[msg.type];
    if (type) {
      dispatch({ type, payload: msg } as SSEAction);
    }
  }, []);

  const { switchUrl } = useSSE(url, onMessage);

  const value = useMemo(() => ({ state, dispatch, switchUrl }), [state, switchUrl]);
  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

export const useSSEState = () => useContext(SSEContext);
