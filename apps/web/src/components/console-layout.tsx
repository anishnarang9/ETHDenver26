"use client";

import { useSSEState } from "../lib/sse-context";
import { AgentBrowserPanel } from "./agent-browser-panel";
import { AgentSpawnTimeline } from "./agent-spawn-timeline";
import { EmailThread } from "./email-thread";
import { EnforcementPipeline } from "./enforcement-pipeline";
import { MissionControl } from "./mission-control";
import { WalletBalances } from "./wallet-balances";
import { ReplayButton } from "./replay-button";
import { Monitor, Mail, Shield, Command, Cpu, Users } from "lucide-react";

const plannerWallet = [
  { name: "Planner (Orchestrator)", address: process.env.NEXT_PUBLIC_PLANNER_ADDRESS || "", color: "#3b82f6" },
].filter((w) => w.address);

const sectionHeaderStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const phaseColors: Record<string, string> = {
  planning: "#3b82f6",
  spawning: "#f59e0b",
  executing: "#22c55e",
  synthesizing: "#8b5cf6",
  completed: "#22c55e",
};

export function ConsoleLayout({ plannerUrl }: { plannerUrl: string }) {
  const { state } = useSSEState();

  // Dynamic browser panels from spawned agents
  const browserEntries = Object.entries(state.browsers);
  const cols = browserEntries.length <= 2 ? browserEntries.length || 1 : browserEntries.length <= 4 ? 2 : 3;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: "1px solid #1e293b" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, background: "linear-gradient(135deg, #38bdf8, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            TripDesk Console
          </h1>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>Dynamic Multi-Agent Orchestrator on Kite</p>
        </div>
        <ReplayButton plannerUrl={plannerUrl} />
      </div>

      {/* Orchestrator Phase Indicator */}
      {state.orchestratorPhase && (
        <div
          style={{
            margin: "12px 24px 0",
            padding: "10px 16px",
            background: `${phaseColors[state.orchestratorPhase] || "#3b82f6"}15`,
            border: `1px solid ${phaseColors[state.orchestratorPhase] || "#3b82f6"}40`,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Cpu size={16} style={{ color: phaseColors[state.orchestratorPhase] || "#3b82f6" }} />
          <span style={{ fontSize: "0.82rem", fontWeight: 600, color: phaseColors[state.orchestratorPhase] || "#3b82f6", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {state.orchestratorPhase}
          </span>
          {state.thoughts.planner && (
            <span style={{ fontSize: "0.75rem", color: "#94a3b8", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {state.thoughts.planner}
            </span>
          )}
        </div>
      )}

      {/* Agent Spawn Timeline */}
      {state.spawnedAgents.length > 0 && (
        <div style={{ padding: "12px 24px 0" }}>
          <h2 style={sectionHeaderStyle}>
            <Users size={14} style={{ color: "#8b5cf6" }} />
            Spawned Agents ({state.spawnedAgents.length})
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(state.spawnedAgents.length, 3)}, 1fr)`, gap: 8 }}>
            <AgentSpawnTimeline agents={state.spawnedAgents} />
          </div>
        </div>
      )}

      {/* Dynamic Browser Panels */}
      {browserEntries.length > 0 && (
        <>
          <div style={{ padding: "12px 24px 0" }}>
            <h2 style={sectionHeaderStyle}>
              <Monitor size={14} style={{ color: "#38bdf8" }} />
              Agent Browsers ({browserEntries.length})
            </h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: "12px", padding: "0 24px 12px" }}>
            {browserEntries.map(([agentId, browser]) => {
              const agent = state.spawnedAgents.find((a) => a.id === agentId);
              const label = agent?.role || agentId;
              return (
                <AgentBrowserPanel
                  key={agentId}
                  agentId={agentId}
                  label={label}
                  browser={browser}
                  thought={state.thoughts[agentId]}
                />
              );
            })}
          </div>
        </>
      )}

      {/* Bottom Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", padding: "0 24px 24px" }}>
        {/* Left: Email + Enforcement */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <h2 style={sectionHeaderStyle}>
              <Mail size={14} style={{ color: "#818cf8" }} />
              Email Thread
            </h2>
            <EmailThread emails={state.emails} />
          </div>
          <div>
            <h2 style={sectionHeaderStyle}>
              <Shield size={14} style={{ color: "#f59e0b" }} />
              Enforcement Pipeline
            </h2>
            <EnforcementPipeline steps={state.enforcementSteps} />
          </div>
        </div>
        {/* Right: Wallets + Mission Control */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {plannerWallet.length > 0 && <WalletBalances wallets={plannerWallet} />}
          <div>
            <h2 style={sectionHeaderStyle}>
              <Command size={14} style={{ color: "#3b82f6" }} />
              Mission Control
            </h2>
            <MissionControl
              transactions={state.transactions}
              plannerUrl={plannerUrl}
              agentAddress={process.env.NEXT_PUBLIC_PLANNER_ADDRESS}
              plannerAddress={process.env.NEXT_PUBLIC_PLANNER_ADDRESS}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
