"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, useRef, type ReactNode } from "react";
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

interface AgentResult {
  agentId: string;
  role: string;
  result?: string;
  status: "success" | "failed";
}

interface SSEState {
  emails: EmailEvent[];
  browsers: Record<string, BrowserPanelState>;
  enforcementSteps: EnforcementStep[];
  transactions: TransactionEvent[];
  thoughts: Record<string, string>;
  agentStatuses: Record<string, string>;
  spawnedAgents: SpawnedAgentInfo[];
  orchestratorPhase: string;
  agentPlan: Array<{ role: string; needsBrowser: boolean; scopes: string[] }>;
  agentResults: AgentResult[];
  synthesisBody?: string;
  agentNodes: AgentNode[];
  emailEdges: EmailEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  inboxAddresses: Record<string, string>;
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
  | { type: "AGENT_SPAWNING"; payload: SSEMessage }
  | { type: "AGENT_SPAWNED"; payload: SSEMessage }
  | { type: "AGENT_PLAN_CREATED"; payload: SSEMessage }
  | { type: "ORCHESTRATOR_PHASE"; payload: SSEMessage }
  | { type: "AGENT_RESULTS"; payload: SSEMessage }
  | { type: "AGENT_EMAIL_SENT"; payload: SSEMessage }
  | { type: "AGENT_EMAIL_RECEIVED"; payload: SSEMessage }
  | { type: "AGENT_INBOX_CREATED"; payload: SSEMessage }
  | { type: "ORCHESTRATOR_DECISION"; payload: SSEMessage }
  | { type: "MERGE_ENFORCEMENT"; steps: EnforcementStep[] }
  | { type: "SET_SPAWNED_AGENTS"; agents: SpawnedAgentInfo[] }
  | { type: "SELECT_NODE"; nodeId: string | null }
  | { type: "SELECT_EDGE"; edgeId: string | null }
  | { type: "SET_RUN_ID"; runId?: string }
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

function inferRoleFromId(agentId: string): string {
  if (agentId === "planner") return "orchestrator";
  if (agentId === "rider" || agentId === "foodie" || agentId === "eventbot") return agentId;
  return "specialist";
}

function toBrowserStatus(value: unknown): BrowserPanelState["status"] {
  if (value === "active" || value === "closed" || value === "revoked" || value === "standby") {
    return value;
  }
  return "active";
}

function upsertAgentNode(nodes: AgentNode[], patch: Partial<AgentNode> & { id: string }): AgentNode[] {
  const index = nodes.findIndex((node) => node.id === patch.id);
  if (index === -1) {
    return [
      ...nodes,
      {
        id: patch.id,
        role: patch.role || inferRoleFromId(patch.id),
        status: patch.status || "spawning",
        address: patch.address,
        inboxAddress: patch.inboxAddress,
      },
    ];
  }
  const next = [...nodes];
  next[index] = {
    ...next[index],
    ...patch,
    role: patch.role || next[index].role,
    status: patch.status || next[index].status,
  };
  return next;
}

function upsertSpawnedAgent(state: SSEState, patch: SpawnedAgentInfo): SSEState {
  const index = state.spawnedAgents.findIndex((agent) => agent.id === patch.id);
  const merged =
    index === -1
      ? [...state.spawnedAgents, patch]
      : state.spawnedAgents.map((agent, i) => (i === index ? { ...agent, ...patch } : agent));

  return {
    ...state,
    spawnedAgents: merged,
    agentNodes: upsertAgentNode(state.agentNodes, {
      id: patch.id,
      role: patch.role,
      status: patch.status,
      address: patch.address,
      inboxAddress: patch.inboxAddress,
    }),
  };
}

function findAgentByInbox(state: SSEState, address: string): string | undefined {
  if (state.inboxAddresses[address]) return state.inboxAddresses[address];
  if (address.includes("planner")) return "planner";
  const agent = state.spawnedAgents.find((item) => item.inboxAddress === address);
  return agent?.id;
}

function appendEmailAndEdge(
  state: SSEState,
  msg: SSEMessage,
  {
    from,
    to,
    subject,
    body,
    threadId,
  }: { from: string; to?: string; subject: string; body: string; threadId?: string }
): SSEState {
  const recipient = to ? findAgentByInbox(state, to) || to : "unknown";
  const edge: EmailEdge = {
    id: `edge-${Date.now()}-${Math.random()}`,
    fromAgentId: msg.agentId,
    toAgentId: recipient,
    subject,
    timestamp: Date.now(),
    threadId,
  };
  const email: EmailEvent = {
    id: `mail-${Date.now()}-${Math.random()}`,
    from,
    to,
    subject,
    body,
    timestamp: new Date().toISOString(),
    agentId: msg.agentId || "planner",
  };
  return {
    ...state,
    emails: [...state.emails, email],
    emailEdges: [...state.emailEdges, edge],
  };
}

function appendReceivedEmail(
  state: SSEState,
  msg: SSEMessage,
  {
    from,
    to,
    subject,
    body,
    threadId,
  }: { from: string; to?: string; subject: string; body: string; threadId?: string }
): SSEState {
  const senderAgentId = from ? findAgentByInbox(state, from) || from : "unknown";
  const edge: EmailEdge = {
    id: `edge-${Date.now()}-${Math.random()}`,
    fromAgentId: senderAgentId,
    toAgentId: msg.agentId,
    subject,
    timestamp: Date.now(),
    threadId,
  };
  const email: EmailEvent = {
    id: `mail-${Date.now()}-${Math.random()}`,
    from,
    to,
    subject,
    body,
    timestamp: new Date().toISOString(),
    agentId: (senderAgentId === "human" ? "human" : msg.agentId) as EmailEvent["agentId"],
  };

  return {
    ...state,
    emails: [...state.emails, email],
    emailEdges: [...state.emailEdges, edge],
  };
}

function reducer(state: SSEState, action: SSEAction): SSEState {
  switch (action.type) {
    case "EMAIL_RECEIVED":
    case "EMAIL_SENT": {
      const payload = action.payload.payload;
      return appendEmailAndEdge(state, action.payload, {
        from: (payload.from as string) || action.payload.agentId,
        to: payload.to as string | undefined,
        subject: (payload.subject as string) || "",
        body: (payload.body as string) || "",
      });
    }
    case "AGENT_EMAIL_SENT": {
      const payload = action.payload.payload;
      return appendEmailAndEdge(state, action.payload, {
        from: (payload.from as string) || action.payload.agentId,
        to: payload.to as string | undefined,
        subject: (payload.subject as string) || "",
        body: (payload.body as string) || "",
        threadId: payload.threadId as string | undefined,
      });
    }
    case "AGENT_EMAIL_RECEIVED": {
      const payload = action.payload.payload;
      return appendReceivedEmail(state, action.payload, {
        from: (payload.from as string) || "unknown",
        to: payload.to as string | undefined,
        subject: (payload.subject as string) || "",
        body: (payload.body as string) || "",
        threadId: payload.threadId as string | undefined,
      });
    }
    case "ORCHESTRATOR_DECISION":
      return state;
    case "BROWSER_SESSION": {
      const payload = action.payload.payload;
      const agentId = action.payload.agentId;
      const status = toBrowserStatus(payload.status);
      return {
        ...state,
        browsers: {
          ...state.browsers,
          [agentId]: {
            agentId,
            liveViewUrl: (payload.liveViewUrl as string) || state.browsers[agentId]?.liveViewUrl,
            status,
            sessionId: payload.sessionId as string | undefined,
          },
        },
        agentNodes: upsertAgentNode(state.agentNodes, { id: agentId, status }),
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
      const payload = action.payload.payload;
      const step: EnforcementStep = {
        step: (payload.step as number) || state.enforcementSteps.length + 1,
        name: (payload.name as string) || (payload.eventType as string) || "Unknown",
        status: (payload.status as EnforcementStep["status"]) || "pass",
        detail: payload.detail as string,
      };
      return { ...state, enforcementSteps: [...state.enforcementSteps, step] };
    }
    case "PAYMENT_START": {
      const payload = action.payload.payload;
      const tx: TransactionEvent = {
        id: `tx-${Date.now()}-${Math.random()}`,
        from: action.payload.agentId || "planner",
        to: (payload.target as string) || "service",
        amount: (payload.amount as string) || "0",
        method: (payload.method as string) || "pending",
        status: "pending",
        timestamp: new Date().toISOString(),
      };
      return { ...state, transactions: [...state.transactions, tx] };
    }
    case "PAYMENT_COMPLETE": {
      const payload = action.payload.payload;
      const txs = [...state.transactions];
      const pending = [...txs].reverse().find((tx) => tx.status === "pending");
      if (pending) {
        pending.status = "complete";
        pending.txHash = payload.txHash as string;
        pending.amount = (payload.amount as string) || pending.amount;
        pending.method = (payload.method as string) || pending.method;
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
    case "AGENT_STATUS": {
      const status = (action.payload.payload.status as string) || "idle";
      return {
        ...state,
        agentStatuses: { ...state.agentStatuses, [action.payload.agentId]: status },
        spawnedAgents:
          action.payload.agentId === "planner"
            ? state.spawnedAgents
            : state.spawnedAgents.map((agent) => (agent.id === action.payload.agentId ? { ...agent, status } : agent)),
        agentNodes: upsertAgentNode(state.agentNodes, {
          id: action.payload.agentId,
          role: (action.payload.payload.role as string) || inferRoleFromId(action.payload.agentId),
          status,
        }),
      };
    }
    case "AGENT_SPAWNING": {
      const payload = action.payload.payload;
      const step = payload.step as string | undefined;
      const txHash = payload.txHash as string | undefined;
      const failed = step === "failed";
      return upsertSpawnedAgent(state, {
        id: action.payload.agentId,
        role: (payload.role as string) || inferRoleFromId(action.payload.agentId),
        address: payload.address as string | undefined,
        status: failed ? "failed" : "spawning",
        step,
        fundingTxHash: step === "funded" ? txHash : undefined,
        passportTxHash: step === "passport_deployed" ? txHash : undefined,
        sessionTxHash: step === "session_granted" ? txHash : undefined,
      });
    }
    case "AGENT_SPAWNED": {
      const payload = action.payload.payload;
      return upsertSpawnedAgent(state, {
        id: action.payload.agentId,
        role: (payload.role as string) || inferRoleFromId(action.payload.agentId),
        address: payload.address as string | undefined,
        status: "active",
        step: "session_granted",
        fundingTxHash: payload.fundingTxHash as string | undefined,
        passportTxHash: payload.passportTxHash as string | undefined,
        sessionTxHash: payload.sessionTxHash as string | undefined,
      });
    }
    case "AGENT_PLAN_CREATED":
      return {
        ...state,
        agentPlan:
          (action.payload.payload.agents as Array<{ role: string; needsBrowser: boolean; scopes: string[] }>) || [],
      };
    case "ORCHESTRATOR_PHASE":
      return {
        ...state,
        orchestratorPhase: (action.payload.payload.phase as string) || "",
      };
    case "AGENT_RESULTS": {
      const payload = action.payload.payload;
      const results = (payload.results as AgentResult[]) || [];
      const body = (payload.synthesisBody as string) || (payload.body as string) || undefined;
      return {
        ...state,
        agentResults: results.length > 0 ? results : state.agentResults,
        synthesisBody: body || state.synthesisBody,
      };
    }
    case "AGENT_INBOX_CREATED": {
      const payload = action.payload.payload;
      const inboxAddress = payload.inboxAddress as string;
      return {
        ...state,
        inboxAddresses: { ...state.inboxAddresses, [inboxAddress]: action.payload.agentId },
        spawnedAgents: state.spawnedAgents.map((agent) =>
          agent.id === action.payload.agentId ? { ...agent, inboxAddress } : agent
        ),
        agentNodes: state.agentNodes.map((node) =>
          node.id === action.payload.agentId ? { ...node, inboxAddress } : node
        ),
      };
    }
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
            inboxAddress: agent.inboxAddress,
          }),
        state.agentNodes
      );
      return { ...state, spawnedAgents: action.agents, agentNodes: nodes };
    }
    case "SELECT_NODE":
      return { ...state, selectedNodeId: action.nodeId, selectedEdgeId: null };
    case "SELECT_EDGE":
      return { ...state, selectedEdgeId: action.edgeId, selectedNodeId: null };
    case "SET_RUN_ID":
      return { ...state, currentRunId: action.runId };
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
  const currentRunRef = useRef<string | undefined>(undefined);

  const onMessage = useCallback((msg: SSEMessage) => {
    if (msg.runId && msg.runId !== currentRunRef.current) {
      currentRunRef.current = msg.runId;
      dispatch({ type: "RESET" });
    }
    dispatch({ type: "SET_RUN_ID", runId: msg.runId });

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

    const actionType = map[msg.type];
    if (actionType) {
      dispatch({ type: actionType, payload: msg } as SSEAction);
    }
  }, []);

  const { switchUrl } = useSSE(url, onMessage);
  const value = useMemo(() => ({ state, dispatch, switchUrl }), [state, switchUrl]);
  return <SSEContext.Provider value={value}>{children}</SSEContext.Provider>;
}

export const useSSEState = () => useContext(SSEContext);

export type { SSEState, SSEAction };
export type { SpawnedAgentInfo, AgentNode, EmailEdge };
