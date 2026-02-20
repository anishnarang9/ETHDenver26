"use client";

import { createContext, useContext, useReducer, useCallback, type ReactNode } from "react";
import { useSSE, type SSEMessage } from "../hooks/use-sse";

interface Email {
  id: string;
  from: string;
  to?: string;
  subject: string;
  body: string;
  timestamp: string;
  agentId: string;
}

interface BrowserPanel {
  agentId: string;
  liveViewUrl?: string;
  status: "standby" | "active" | "closed" | "revoked";
  thought?: string;
}

interface EnforcementStep {
  step: number;
  name: string;
  status: "pending" | "pass" | "fail";
  detail?: string;
}

interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: string;
  method: string;
  txHash?: string;
  status: "pending" | "complete" | "failed";
  timestamp: string;
}

interface SSEState {
  emails: Email[];
  browsers: Record<string, BrowserPanel>;
  enforcementSteps: EnforcementStep[];
  transactions: Transaction[];
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

function sseReducer(state: SSEState, action: SSEAction): SSEState {
  switch (action.type) {
    case "EMAIL_RECEIVED":
    case "EMAIL_SENT": {
      const p = action.payload.payload;
      return {
        ...state,
        emails: [...state.emails, {
          id: `email-${Date.now()}-${Math.random()}`,
          from: (p.from as string) || action.payload.agentId,
          to: p.to as string,
          subject: (p.subject as string) || "",
          body: (p.body as string) || "",
          timestamp: new Date().toISOString(),
          agentId: action.payload.agentId,
        }],
      };
    }
    case "BROWSER_SESSION": {
      const p = action.payload.payload;
      const agentId = action.payload.agentId;
      return {
        ...state,
        browsers: {
          ...state.browsers,
          [agentId]: {
            agentId,
            liveViewUrl: (p.liveViewUrl as string) || state.browsers[agentId]?.liveViewUrl,
            status: (p.status as BrowserPanel["status"]) || "active",
          },
        },
      };
    }
    case "LLM_THINKING": {
      return {
        ...state,
        thoughts: { ...state.thoughts, [action.payload.agentId]: action.payload.payload.text as string },
      };
    }
    case "ENFORCEMENT_STEP": {
      const p = action.payload.payload;
      const step: EnforcementStep = {
        step: (p.step as number) || state.enforcementSteps.length + 1,
        name: (p.name as string) || (p.eventType as string) || "",
        status: (p.status as EnforcementStep["status"]) || "pass",
        detail: p.detail as string,
      };
      return { ...state, enforcementSteps: [...state.enforcementSteps, step] };
    }
    case "PAYMENT_START": {
      const p = action.payload.payload;
      return {
        ...state,
        transactions: [...state.transactions, {
          id: `tx-${Date.now()}-${Math.random()}`,
          from: "planner",
          to: (p.target as string) || "",
          amount: (p.amount as string) || "",
          method: (p.method as string) || "pending",
          status: "pending",
          timestamp: new Date().toISOString(),
        }],
      };
    }
    case "PAYMENT_COMPLETE": {
      const p = action.payload.payload;
      const txs = [...state.transactions];
      const last = [...txs].reverse().find((t: Transaction) => t.status === "pending");
      if (last) {
        last.status = "complete";
        last.txHash = p.txHash as string;
        last.method = (p.method as string) || last.method;
        last.amount = (p.amount as string) || last.amount;
      }
      return { ...state, transactions: txs };
    }
    case "PAYMENT_FAILED": {
      const txs = [...state.transactions];
      const last = [...txs].reverse().find((t: Transaction) => t.status === "pending");
      if (last) last.status = "failed";
      return { ...state, transactions: txs };
    }
    case "AGENT_STATUS": {
      return {
        ...state,
        agentStatuses: { ...state.agentStatuses, [action.payload.agentId]: action.payload.payload.status as string },
      };
    }
    case "RESET":
      return { ...initialState };
    default:
      return state;
  }
}

const SSEContext = createContext<{
  state: SSEState;
  dispatch: React.Dispatch<SSEAction>;
  switchUrl: (url: string) => void;
}>({ state: initialState, dispatch: () => {}, switchUrl: () => {} });

export function SSEProvider({ url, children }: { url: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(sseReducer, initialState);

  const handleMessage = useCallback((msg: SSEMessage) => {
    const typeMap: Record<string, SSEAction["type"]> = {
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
    const actionType = typeMap[msg.type];
    if (actionType) {
      dispatch({ type: actionType, payload: msg } as SSEAction);
    }
  }, []);

  const { switchUrl } = useSSE(url, handleMessage);

  return (
    <SSEContext.Provider value={{ state, dispatch, switchUrl }}>
      {children}
    </SSEContext.Provider>
  );
}

export const useSSEState = () => useContext(SSEContext);
