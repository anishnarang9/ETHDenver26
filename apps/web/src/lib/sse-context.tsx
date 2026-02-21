"use client";

import React, { createContext, useContext, useReducer, useCallback, type ReactNode } from "react";
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

export interface SpawnedAgentInfo {
  id: string;
  role: string;
  address?: string;
  status: "spawning" | "active" | "completed" | "failed" | "revoked";
  step?: string;
  txHash?: string;
  fundingTxHash?: string;
  passportTxHash?: string;
  sessionTxHash?: string;
  inboxAddress?: string;
}

export interface AgentResult {
  agentId: string;
  role: string;
  result?: string;
  status: "success" | "failed";
}

/* ---- Graph types ---- */

export interface AgentNode {
  id: string;
  role: string;
  status: "spawning" | "active" | "completed" | "failed";
  inboxAddress?: string;
}

export interface EmailEdge {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  timestamp: number;
  threadId?: string;
}

export interface SSEState {
  emails: Email[];
  browsers: Record<string, BrowserPanel>;
  enforcementSteps: EnforcementStep[];
  transactions: Transaction[];
  thoughts: Record<string, string>;
  agentStatuses: Record<string, string>;
  spawnedAgents: SpawnedAgentInfo[];
  orchestratorPhase: string;
  agentPlan: Array<{ role: string; needsBrowser: boolean; scopes: string[] }>;
  agentResults: AgentResult[];
  synthesisBody?: string;
  currentRunId?: string;
  // Graph state
  agentNodes: AgentNode[];
  emailEdges: EmailEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  inboxAddresses: Record<string, string>;
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
  | { type: "AGENT_SPAWNING"; payload: SSEMessage }
  | { type: "AGENT_SPAWNED"; payload: SSEMessage }
  | { type: "AGENT_PLAN_CREATED"; payload: SSEMessage }
  | { type: "ORCHESTRATOR_PHASE"; payload: SSEMessage }
  | { type: "AGENT_RESULTS"; payload: SSEMessage }
  | { type: "AGENT_EMAIL_SENT"; payload: SSEMessage }
  | { type: "AGENT_EMAIL_RECEIVED"; payload: SSEMessage }
  | { type: "AGENT_INBOX_CREATED"; payload: SSEMessage }
  | { type: "ORCHESTRATOR_DECISION"; payload: SSEMessage }
  | { type: "SELECT_NODE"; nodeId: string | null }
  | { type: "SELECT_EDGE"; edgeId: string | null }
  | { type: "RESET" };

const initialState: SSEState = {
  emails: [],
  browsers: {},
  enforcementSteps: [],
  transactions: [],
  thoughts: {},
  agentStatuses: {},
  spawnedAgents: [],
  orchestratorPhase: "",
  agentPlan: [],
  agentResults: [],
  agentNodes: [{ id: "planner", role: "orchestrator", status: "active" }],
  emailEdges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  inboxAddresses: {},
};

function findAgentByInbox(state: SSEState, address: string): string | undefined {
  if (state.inboxAddresses[address]) return state.inboxAddresses[address];
  if (address.includes("planner")) return "planner";
  const agent = state.spawnedAgents.find((a) => a.inboxAddress === address);
  return agent?.id;
}

function sseReducer(state: SSEState, action: SSEAction): SSEState {
  switch (action.type) {
    case "EMAIL_RECEIVED":
    case "EMAIL_SENT": {
      const p = action.payload.payload;
      return {
        ...state,
        emails: [...state.emails, {
          id: "email-" + Date.now() + "-" + Math.random(),
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
          id: "tx-" + Date.now() + "-" + Math.random(),
          from: action.payload.agentId || "planner",
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
      const p = action.payload.payload;
      const agentId = action.payload.agentId;
      const newStatus = p.status as string;
      return {
        ...state,
        agentStatuses: { ...state.agentStatuses, [agentId]: newStatus },
        spawnedAgents: state.spawnedAgents.map((a) =>
          a.id === agentId
            ? { ...a, status: (newStatus as SpawnedAgentInfo["status"]) || a.status }
            : a,
        ),
        agentNodes: state.agentNodes.map((n) =>
          n.id === agentId
            ? { ...n, status: (newStatus as AgentNode["status"]) || n.status }
            : n,
        ),
      };
    }
    case "AGENT_SPAWNING": {
      const p = action.payload.payload;
      const agentId = action.payload.agentId;
      const existing = state.spawnedAgents.find((a) => a.id === agentId);
      if (existing) {
        return {
          ...state,
          spawnedAgents: state.spawnedAgents.map((a) =>
            a.id === agentId
              ? {
                  ...a,
                  step: p.step as string,
                  txHash: (p.txHash as string) || a.txHash,
                  address: (p.address as string) || a.address,
                  fundingTxHash: p.step === "funded" ? (p.txHash as string) : a.fundingTxHash,
                  passportTxHash: p.step === "passport_deployed" ? (p.txHash as string) : a.passportTxHash,
                  sessionTxHash: p.step === "session_granted" ? (p.txHash as string) : a.sessionTxHash,
                  status: p.step === "failed" ? "failed" : a.status,
                }
              : a,
          ),
        };
      }
      const existingNode = state.agentNodes.find((n) => n.id === agentId);
      return {
        ...state,
        spawnedAgents: [
          ...state.spawnedAgents,
          {
            id: agentId,
            role: p.role as string,
            address: p.address as string,
            status: "spawning",
            step: p.step as string,
          },
        ],
        agentNodes: existingNode
          ? state.agentNodes
          : [
              ...state.agentNodes,
              {
                id: agentId,
                role: (p.role as string) || agentId,
                status: "spawning" as const,
              },
            ],
      };
    }
    case "AGENT_SPAWNED": {
      const p = action.payload.payload;
      const agentId = action.payload.agentId;
      return {
        ...state,
        spawnedAgents: state.spawnedAgents.map((a) =>
          a.id === agentId
            ? {
                ...a,
                status: "active" as const,
                address: (p.address as string) || a.address,
                fundingTxHash: (p.fundingTxHash as string) || a.fundingTxHash,
                passportTxHash: (p.passportTxHash as string) || a.passportTxHash,
                sessionTxHash: (p.sessionTxHash as string) || a.sessionTxHash,
              }
            : a,
        ),
        agentNodes: state.agentNodes.map((n) =>
          n.id === agentId ? { ...n, status: "active" as const } : n,
        ),
      };
    }
    case "AGENT_PLAN_CREATED": {
      const p = action.payload.payload;
      return {
        ...state,
        agentPlan: (p.agents as SSEState["agentPlan"]) || [],
      };
    }
    case "ORCHESTRATOR_PHASE": {
      const p = action.payload.payload;
      return {
        ...state,
        orchestratorPhase: (p.phase as string) || "",
      };
    }
    case "AGENT_RESULTS": {
      const p = action.payload.payload;
      const results = (p.results as AgentResult[]) || [];
      const body = (p.synthesisBody as string) || (p.body as string) || undefined;
      return {
        ...state,
        agentResults: results.length > 0 ? results : state.agentResults,
        synthesisBody: body || state.synthesisBody,
      };
    }
    case "AGENT_INBOX_CREATED": {
      const p = action.payload.payload;
      const agentId = action.payload.agentId;
      const inboxAddress = p.inboxAddress as string;
      return {
        ...state,
        inboxAddresses: { ...state.inboxAddresses, [inboxAddress]: agentId },
        spawnedAgents: state.spawnedAgents.map((a) =>
          a.id === agentId ? { ...a, inboxAddress } : a,
        ),
        agentNodes: state.agentNodes.map((n) =>
          n.id === agentId ? { ...n, inboxAddress } : n,
        ),
      };
    }
    case "AGENT_EMAIL_SENT": {
      const p = action.payload.payload;
      const senderAgentId = action.payload.agentId;
      const toAddress = p.to as string;
      const fromAddress = p.from as string;
      const recipientAgentId = findAgentByInbox(state, toAddress) || "unknown";

      const edge: EmailEdge = {
        id: "edge-" + Date.now() + "-" + Math.random(),
        fromAgentId: senderAgentId,
        toAgentId: recipientAgentId,
        fromAddress,
        toAddress,
        subject: (p.subject as string) || "",
        body: (p.body as string) || "",
        timestamp: Date.now(),
        threadId: p.threadId as string,
      };

      return {
        ...state,
        emailEdges: [...state.emailEdges, edge],
        emails: [...state.emails, {
          id: "email-" + Date.now() + "-" + Math.random(),
          from: fromAddress || senderAgentId,
          to: toAddress,
          subject: (p.subject as string) || "",
          body: (p.body as string) || "",
          timestamp: new Date().toISOString(),
          agentId: senderAgentId,
        }],
      };
    }
    case "AGENT_EMAIL_RECEIVED": {
      return state;
    }
    case "ORCHESTRATOR_DECISION": {
      return state;
    }
    case "SELECT_NODE": {
      return { ...state, selectedNodeId: action.nodeId, selectedEdgeId: null };
    }
    case "SELECT_EDGE": {
      return { ...state, selectedEdgeId: action.edgeId, selectedNodeId: null };
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

  const currentRunRef = React.useRef<string | undefined>(undefined);

  const handleMessage = useCallback((msg: SSEMessage) => {
    if (msg.runId && msg.runId !== currentRunRef.current) {
      currentRunRef.current = msg.runId;
      dispatch({ type: "RESET" });
    }

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
      agent_spawning: "AGENT_SPAWNING",
      agent_spawned: "AGENT_SPAWNED",
      agent_plan_created: "AGENT_PLAN_CREATED",
      orchestrator_phase: "ORCHESTRATOR_PHASE",
      agent_results: "AGENT_RESULTS",
      agent_email_sent: "AGENT_EMAIL_SENT",
      agent_email_received: "AGENT_EMAIL_RECEIVED",
      agent_inbox_created: "AGENT_INBOX_CREATED",
      orchestrator_decision: "ORCHESTRATOR_DECISION",
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
