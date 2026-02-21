"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import { useSSE } from "../hooks/use-sse";
import type {
  AgentNode,
  BrowserPanelState,
  EmailEdge,
  EmailEvent,
  EnforcementStep,
  SSEMessage,
  SpawnedAgentInfo,
  TransactionEvent,
} from "./types";

interface SSEState {
  emails: EmailEvent[];
  browsers: Record<string, BrowserPanelState>;
  enforcementSteps: EnforcementStep[];
  transactions: TransactionEvent[];
  thoughts: Record<string, string>;
  agentStatuses: Record<string, string>;
  spawnedAgents: SpawnedAgentInfo[];
  agentNodes: AgentNode[];
  emailEdges: EmailEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  currentRunId?: string;
}

type SSEAction =
  | { type: "EMAIL_RECEIVED"; payload: SSEMessage }
  | { type: "EMAIL_SENT"; payload: SSEMessage }
  | { type: "AGENT_SPAWNING"; payload: SSEMessage }
  | { type: "AGENT_SPAWNED"; payload: SSEMessage }
  | { type: "BROWSER_SESSION"; payload: SSEMessage }
  | { type: "LLM_THINKING"; payload: SSEMessage }
  | { type: "ENFORCEMENT_STEP"; payload: SSEMessage }
  | { type: "PAYMENT_START"; payload: SSEMessage }
  | { type: "PAYMENT_COMPLETE"; payload: SSEMessage }
  | { type: "PAYMENT_FAILED"; payload: SSEMessage }
  | { type: "AGENT_STATUS"; payload: SSEMessage }
  | { type: "MERGE_ENFORCEMENT"; steps: EnforcementStep[] }
  | { type: "SET_SPAWNED_AGENTS"; agents: SpawnedAgentInfo[] }
  | { type: "SELECT_NODE"; nodeId: string | null }
  | { type: "SELECT_EDGE"; edgeId: string | null }
  | { type: "RESET" };

function inferRoleFromId(agentId: string): string {
  const direct = new Set(["planner", "rider", "foodie", "eventbot"]);
  if (direct.has(agentId)) {
    return agentId;
  }
  return "specialist";
}

function toBrowserStatus(value: unknown): BrowserPanelState["status"] {
  if (value === "active" || value === "closed" || value === "revoked" || value === "standby") {
    return value;
  }
  return "active";
}

function upsertAgentNode(nodes: AgentNode[], patch: Partial<AgentNode> & { id: string }): AgentNode[] {
  const idx = nodes.findIndex((node) => node.id === patch.id);
  if (idx === -1) {
    return [
      ...nodes,
      {
        id: patch.id,
        role: patch.role || inferRoleFromId(patch.id),
        status: patch.status || "standby",
        address: patch.address,
        inboxAddress: patch.inboxAddress,
      },
    ];
  }
  const next = [...nodes];
  next[idx] = {
    ...next[idx],
    ...patch,
    role: patch.role || next[idx].role,
    status: patch.status || next[idx].status,
  };
  return next;
}

function upsertSpawnedAgent(state: SSEState, update: SpawnedAgentInfo): SSEState {
  const index = state.spawnedAgents.findIndex((agent) => agent.id === update.id);
  const merged =
    index === -1
      ? [...state.spawnedAgents, update]
      : state.spawnedAgents.map((agent, i) => (i === index ? { ...agent, ...update } : agent));
  return {
    ...state,
    spawnedAgents: merged,
    agentNodes: upsertAgentNode(state.agentNodes, {
      id: update.id,
      role: update.role,
      status: update.status,
      address: update.address,
      inboxAddress: update.inboxAddress,
    }),
  };
}

const initialState: SSEState = {
  emails: [],
  browsers: {},
  enforcementSteps: [],
  transactions: [],
  thoughts: {},
  agentStatuses: {},
  spawnedAgents: [],
  agentNodes: [{ id: "planner", role: "planner", status: "standby" }],
  emailEdges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
};

function reducer(state: SSEState, action: SSEAction): SSEState {
  switch (action.type) {
    case "EMAIL_RECEIVED":
    case "EMAIL_SENT": {
      const p = action.payload.payload;
      const from = (p.from as string) || action.payload.agentId;
      const to = p.to as string | undefined;
      const item: EmailEvent = {
        id: `mail-${Date.now()}-${Math.random()}`,
        from,
        to,
        subject: (p.subject as string) || "",
        body: (p.body as string) || (p.latestMessage as string) || "No message body",
        timestamp: new Date().toISOString(),
        agentId: (action.payload.agentId as EmailEvent["agentId"]) || "planner",
      };
      const recipient = to || "unknown";
      const edge: EmailEdge = {
        id: `${action.payload.agentId}--${recipient}--${Date.now()}`,
        fromAgentId: action.payload.agentId,
        toAgentId: recipient,
        subject: item.subject,
        timestamp: Date.now(),
      };
      return {
        ...state,
        emails: [...state.emails, item],
        emailEdges: [...state.emailEdges, edge],
      };
    }
    case "AGENT_SPAWNING": {
      const p = action.payload.payload;
      const next: SpawnedAgentInfo = {
        id: action.payload.agentId,
        role: (p.role as string) || inferRoleFromId(action.payload.agentId),
        status: "spawning",
        step: p.step as string | undefined,
      };
      return upsertSpawnedAgent(state, next);
    }
    case "AGENT_SPAWNED": {
      const p = action.payload.payload;
      const next: SpawnedAgentInfo = {
        id: action.payload.agentId,
        role: (p.role as string) || inferRoleFromId(action.payload.agentId),
        address: p.address as string | undefined,
        status: (p.status as string) || "active",
        step: "session_granted",
      };
      return upsertSpawnedAgent(state, next);
    }
    case "BROWSER_SESSION": {
      const p = action.payload.payload;
      const agentId = action.payload.agentId;
      const status = toBrowserStatus(p.status);
      return {
        ...state,
        browsers: {
          ...state.browsers,
          [agentId]: {
            agentId: agentId as BrowserPanelState["agentId"],
            liveViewUrl: (p.liveViewUrl as string) || state.browsers[agentId]?.liveViewUrl,
            status,
            sessionId: p.sessionId as string,
          },
        },
        agentNodes: upsertAgentNode(state.agentNodes, {
          id: agentId,
          status,
        }),
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
        agentNodes: upsertAgentNode(state.agentNodes, {
          id: action.payload.agentId,
          role: (action.payload.payload.role as string) || inferRoleFromId(action.payload.agentId),
          status: (action.payload.payload.status as string) || "idle",
        }),
        spawnedAgents:
          action.payload.agentId === "planner"
            ? state.spawnedAgents
            : state.spawnedAgents.map((agent) =>
                agent.id === action.payload.agentId
                  ? { ...agent, status: (action.payload.payload.status as string) || agent.status }
                  : agent,
              ),
      };
    case "MERGE_ENFORCEMENT":
      return { ...state, enforcementSteps: action.steps };
    case "SET_SPAWNED_AGENTS": {
      const nodes = action.agents.reduce<AgentNode[]>(
        (acc, agent) =>
          upsertAgentNode(acc, {
            id: agent.id,
            role: agent.role,
            status: agent.status,
            address: agent.address,
          }),
        state.agentNodes,
      );
      return { ...state, spawnedAgents: action.agents, agentNodes: nodes };
    }
    case "SELECT_NODE":
      return { ...state, selectedNodeId: action.nodeId, selectedEdgeId: null };
    case "SELECT_EDGE":
      return { ...state, selectedEdgeId: action.edgeId, selectedNodeId: null };
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
      agent_email_sent: "EMAIL_SENT",
      agent_email_received: "EMAIL_RECEIVED",
      agent_spawning: "AGENT_SPAWNING",
      agent_spawned: "AGENT_SPAWNED",
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

export type { SSEState, SSEAction };
export type { SpawnedAgentInfo, AgentNode, EmailEdge };
