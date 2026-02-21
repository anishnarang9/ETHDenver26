"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AgentBrowserPanel } from "./agent-browser-panel";
import { EmailThread } from "./email-thread";
import { EnforcementPipeline } from "./enforcement-pipeline";
import { MissionControl } from "./mission-control";
import { ReplayButton } from "./replay-button";
import { WalletBalances } from "./wallet-balances";
import { ENFORCEMENT_LABELS, ENFORCEMENT_SEQUENCE } from "../lib/types";
import { gatewayBase } from "../lib/api";
import { useSSEState } from "../lib/sse-context";
import type { EnforcementStep } from "../lib/types";

const wallets = [
  { name: "Planner", address: process.env.NEXT_PUBLIC_PLANNER_ADDRESS || "", color: "#3b82f6" },
  { name: "Rider", address: process.env.NEXT_PUBLIC_RIDER_ADDRESS || "", color: "#22d3ee" },
  { name: "Foodie", address: process.env.NEXT_PUBLIC_FOODIE_ADDRESS || "", color: "#f59e0b" },
  { name: "EventBot", address: process.env.NEXT_PUBLIC_EVENTBOT_ADDRESS || "", color: "#f04438" },
].filter((wallet) => Boolean(wallet.address));

function mapTimelineToSteps(events: Array<{ eventType: string; detailsJson: Record<string, unknown> }>): EnforcementStep[] {
  const byName = new Map<string, Record<string, unknown>>();
  for (const event of events) {
    if (!byName.has(event.eventType)) {
      byName.set(event.eventType, event.detailsJson || {});
    }
  }

  const steps: EnforcementStep[] = ENFORCEMENT_SEQUENCE.map((eventType, idx) => ({
    step: idx + 1,
    name: eventType,
    status: byName.has(eventType) ? "pass" : "pending",
    detail: byName.has(eventType) ? JSON.stringify(byName.get(eventType)) : undefined,
  }));

  if (byName.has("REQUEST_BLOCKED")) {
    const blockedDetail = byName.get("REQUEST_BLOCKED") || {};
    const firstPending = steps.find((step) => step.status === "pending") || steps[steps.length - 1];
    if (firstPending) {
      firstPending.status = "fail";
      firstPending.name = "REQUEST_BLOCKED";
      firstPending.detail = `${ENFORCEMENT_LABELS.REQUEST_BLOCKED}: ${JSON.stringify(blockedDetail)}`;
    }
  }

  return steps;
}

export function ConsoleLayout({ plannerUrl }: { plannerUrl: string }) {
  const { state, dispatch } = useSSEState();
  const [agentOrder, setAgentOrder] = useState<string[]>(["rider", "foodie", "eventbot"]);

  useEffect(() => {
    const discovered = new Set<string>();
    for (const agent of state.spawnedAgents) {
      if (agent.id !== "planner") discovered.add(agent.id);
    }
    for (const agentId of Object.keys(state.browsers)) {
      if (agentId !== "planner") discovered.add(agentId);
    }
    if (discovered.size === 0) return;

    setAgentOrder((prev) => {
      const next = [...prev];
      for (const id of discovered) {
        if (!next.includes(id)) next.push(id);
      }
      return next;
    });
  }, [state.spawnedAgents, state.browsers]);

  const visibleAgents = useMemo(() => {
    const roleById = new Map<string, string>();
    for (const agent of state.spawnedAgents) {
      roleById.set(agent.id, agent.role || agent.id);
    }

    return agentOrder.map((id) => ({
      id,
      label: roleById.get(id) || id,
    }));
  }, [agentOrder, state.spawnedAgents]);

  useEffect(() => {
    const agent = process.env.NEXT_PUBLIC_PLANNER_ADDRESS;
    if (!agent) {
      return;
    }

    const poll = async () => {
      try {
        const response = await fetch(`${gatewayBase}/api/timeline/${agent}`, { cache: "no-store" });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as {
          events: Array<{ actionId: string; eventType: string; detailsJson: Record<string, unknown> }>;
        };
        const latestActionId = payload.events[0]?.actionId;
        if (!latestActionId) {
          return;
        }
        const actionEvents = payload.events.filter((event) => event.actionId === latestActionId);
        const mapped = mapTimelineToSteps(actionEvents);
        dispatch({ type: "MERGE_ENFORCEMENT", steps: mapped });
      } catch {
        // ignore timeline poll failures
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 4000);

    return () => clearInterval(interval);
  }, [dispatch]);

  useEffect(() => {
    const pollAgents = async () => {
      try {
        const response = await fetch(`${plannerUrl}/api/agents`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          agents?: Array<{
            id: string;
            role: string;
            address?: string;
            status: string;
            fundingTxHash?: string;
            passportTxHash?: string;
            sessionTxHash?: string;
            createdAt?: string;
          }>;
        };
        dispatch({ type: "SET_SPAWNED_AGENTS", agents: payload.agents || [] });
      } catch {
        // ignore planner poll failures
      }
    };

    void pollAgents();
    const interval = setInterval(() => {
      void pollAgents();
    }, 4000);

    return () => clearInterval(interval);
  }, [dispatch, plannerUrl]);

  return (
    <>
      <div className="dashboard-home-wrap">
        <Link href="/" className="dashboard-home-button">
          <ArrowLeft size={14} />
          Back to Home
        </Link>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div>
          <h2 className="page-title">Live Operations Console</h2>
          <p className="page-subtitle">
            Real-time planner stream, specialist browser sessions, gateway enforcement evidence, and payment events.
          </p>
        </div>
        <div className="inline-actions">
          <Link href="/" className="secondary-button">Back to Home</Link>
          <ReplayButton plannerUrl={plannerUrl} />
        </div>
      </div>

      <div className="agent-grid" style={{ marginTop: 14 }}>
        {visibleAgents.map((agent) => (
          <AgentBrowserPanel
            key={agent.id}
            label={agent.label}
            browser={state.browsers[agent.id]}
            thought={state.thoughts[agent.id]}
          />
        ))}
      </div>

      <div className="console-grid">
        <div className="stack">
          <div className="panel">
            <h3 className="panel-title">Email Thread</h3>
            <div style={{ marginTop: 10 }}>
              <EmailThread emails={state.emails} />
            </div>
          </div>

          <div className="panel">
            <h3 className="panel-title">Enforcement Pipeline</h3>
            <div style={{ marginTop: 10 }}>
              <EnforcementPipeline steps={state.enforcementSteps} />
            </div>
          </div>
        </div>

        <div className="stack">
          {wallets.length > 0 && <WalletBalances wallets={wallets} />}
          <MissionControl transactions={state.transactions} plannerUrl={plannerUrl} />
        </div>
      </div>
    </>
  );
}
