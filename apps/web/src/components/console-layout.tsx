"use client";

import { useSSEState } from "../lib/sse-context";
import { AgentCard } from "./agent-card";
import { OrchestratorPhaseBanner } from "./orchestrator-phase-banner";
import { SynthesisPanel } from "./synthesis-panel";
import { EmailThread } from "./email-thread";
import { EnforcementPipeline } from "./enforcement-pipeline";
import { MissionControl } from "./mission-control";
import { WalletBalances } from "./wallet-balances";
import { ReplayButton } from "./replay-button";
import { AnimatePresence } from "framer-motion";
import { Mail, Shield, Command, Users, Zap } from "lucide-react";

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

export function ConsoleLayout({ plannerUrl }: { plannerUrl: string }) {
  const { state } = useSSEState();

  const agentCount = state.spawnedAgents.length;
  const gridCols = agentCount <= 1 ? 1 : agentCount <= 3 ? agentCount : 3;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "'Inter', sans-serif" }}>
      {/* ═══ Header ═══ */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 24px",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.5rem",
                fontWeight: 700,
                background: "linear-gradient(135deg, #38bdf8, #818cf8)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              TripDesk Console
            </h1>
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
              Dynamic Multi-Agent Orchestrator on Kite
            </p>
          </div>
          {/* Agent count pill */}
          {agentCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 20,
                background: "#1e293b",
                border: "1px solid #334155",
                fontSize: "0.72rem",
                fontWeight: 600,
                color: "#94a3b8",
              }}
            >
              <Users size={12} style={{ color: "#8b5cf6" }} />
              {agentCount} agent{agentCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <ReplayButton plannerUrl={plannerUrl} />
      </div>

      {/* ═══ Phase Banner ═══ */}
      {state.orchestratorPhase && (
        <div style={{ padding: "14px 0 0" }}>
          <OrchestratorPhaseBanner
            phase={state.orchestratorPhase}
            plannerThought={state.thoughts.planner}
          />
        </div>
      )}

      {/* ═══ Agent Grid ═══ */}
      {agentCount > 0 && (
        <div style={{ padding: "16px 24px 0" }}>
          <h2 style={sectionHeaderStyle}>
            <Zap size={14} style={{ color: "#f59e0b" }} />
            Active Agents
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gap: 12,
            }}
          >
            <AnimatePresence>
              {state.spawnedAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  browser={state.browsers[agent.id]}
                  thought={state.thoughts[agent.id]}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ═══ Bottom Row: Left (Email + Enforcement) | Right (Synthesis + Mission Control) ═══ */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          padding: "16px 24px 24px",
        }}
      >
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Synthesis Panel */}
          <div>
            <h2 style={sectionHeaderStyle}>
              <Zap size={14} style={{ color: "#8b5cf6" }} />
              Synthesis
            </h2>
            <SynthesisPanel
              phase={state.orchestratorPhase}
              plannerThought={state.thoughts.planner}
              synthesisBody={state.synthesisBody}
            />
          </div>

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
