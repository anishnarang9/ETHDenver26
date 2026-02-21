"use client";

import { useState } from "react";
import { useSSEState } from "../lib/sse-context";
import { AgentNetworkGraph } from "./agent-network-graph";
import { AgentCard } from "./agent-card";
import { EmailChainView } from "./email-chain-view";
import { EnforcementPipeline } from "./enforcement-pipeline";
import { MissionControl } from "./mission-control";
import { WalletBalances } from "./wallet-balances";
import { ReplayButton } from "./replay-button";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, Shield, Command, Users, OctagonX, Network, Zap, Loader2 } from "lucide-react";

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
  const { state, dispatch } = useSSEState();
  const [killing, setKilling] = useState(false);

  const agentCount = state.spawnedAgents.length;
  const emailCount = state.emailEdges.length;

  const isRunning =
    !!state.orchestratorPhase &&
    state.orchestratorPhase !== "completed" &&
    state.orchestratorPhase !== "killed";

  const handleKill = async () => {
    setKilling(true);
    try {
      await fetch(plannerUrl + "/api/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      dispatch({ type: "RESET" });
    } catch {
      dispatch({ type: "RESET" });
    } finally {
      setKilling(false);
    }
  };

  const gridCols = agentCount <= 1 ? 1 : 2;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 24px",
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
              TripDesk
            </h1>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>
              Email-Chain Agent Network on Kite
            </p>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {agentCount > 0 && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 10px", borderRadius: 20,
                background: "#1e293b", border: "1px solid #334155",
                fontSize: "0.7rem", fontWeight: 600, color: "#94a3b8",
              }}>
                <Users size={11} style={{ color: "#8b5cf6" }} />
                {agentCount} agent{agentCount !== 1 ? "s" : ""}
              </span>
            )}
            {emailCount > 0 && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 10px", borderRadius: 20,
                background: "#1e293b", border: "1px solid #334155",
                fontSize: "0.7rem", fontWeight: 600, color: "#94a3b8",
              }}>
                <Mail size={11} style={{ color: "#818cf8" }} />
                {emailCount} email{emailCount !== 1 ? "s" : ""}
              </span>
            )}
            {state.orchestratorPhase && state.orchestratorPhase !== "completed" && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 10px", borderRadius: 20,
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                fontSize: "0.7rem", fontWeight: 600, color: "#22c55e",
                animation: "node-pulse 2s ease-in-out infinite",
              }}>
                {state.orchestratorPhase}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <AnimatePresence>
            {isRunning && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9, x: 10 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={handleKill}
                disabled={killing}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: 8,
                  border: "1px solid #ef444480",
                  background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                  color: "#fff", fontWeight: 700, fontSize: "0.75rem",
                  cursor: killing ? "not-allowed" : "pointer",
                  fontFamily: "inherit", opacity: killing ? 0.6 : 1,
                  boxShadow: "0 0 20px rgba(239,68,68,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
                  textTransform: "uppercase", letterSpacing: "0.04em",
                }}
              >
                <OctagonX size={13} />
                {killing ? "Killing..." : "Kill All"}
              </motion.button>
            )}
          </AnimatePresence>
          <ReplayButton plannerUrl={plannerUrl} />
        </div>
      </div>

      {/* Main 50/50 split: Graph (left) + Agent Cards (right) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          padding: "16px 24px 0",
        }}
      >
        {/* Left: Agent Network Graph */}
        <div
          style={{
            background: "#0f0f18",
            borderRadius: 12,
            border: "1px solid #1e293b",
            padding: 16,
            minHeight: 380,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h2 style={sectionHeaderStyle}>
            <Network size={14} style={{ color: "#818cf8" }} />
            Agent Network
          </h2>
          <div style={{ flex: 1, minHeight: 320 }}>
            <AgentNetworkGraph />
          </div>
          {/* Orchestrator thought below graph */}
          {state.thoughts.planner && (
            <div style={{
              marginTop: 8, padding: "8px 12px",
              background: "#111827", borderRadius: 8,
              border: "1px solid #1e293b",
              fontSize: "0.72rem", fontStyle: "italic",
              color: "#94a3b8", maxHeight: 60, overflow: "hidden",
            }}>
              <span style={{ color: "#818cf8", fontWeight: 600, fontStyle: "normal" }}>Orchestrator: </span>
              {state.thoughts.planner.slice(0, 150)}
              {state.thoughts.planner.length > 150 && "..."}
            </div>
          )}
        </div>

        {/* Right: Agent Cards */}
        <div
          style={{
            background: "#0f0f18",
            borderRadius: 12,
            border: "1px solid #1e293b",
            padding: 16,
            minHeight: 380,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <h2 style={sectionHeaderStyle}>
            <Zap size={14} style={{ color: "#f59e0b" }} />
            Active Agents
          </h2>
          {agentCount > 0 ? (
            <div
              className="agent-scroll"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(" + gridCols + ", 1fr)",
                gap: 12,
                maxHeight: "calc(100vh - 340px)",
                overflowY: "auto",
                flex: 1,
                paddingRight: 4,
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
          ) : (
            <div style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#334155",
              gap: 8,
            }}>
              <Loader2 size={24} style={{ animation: "spin 2s linear infinite" }} />
              <span style={{ fontSize: "0.78rem", color: "#475569" }}>
                Waiting for agents to spawn...
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Enforcement + Mission Control (2-col) */}
      <div style={{ padding: "16px 24px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Left: Enforcement Pipeline + Wallet */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <h2 style={sectionHeaderStyle}>
                <Shield size={14} style={{ color: "#f59e0b" }} />
                Enforcement Pipeline
              </h2>
              <EnforcementPipeline steps={state.enforcementSteps} />
            </div>
            {plannerWallet.length > 0 && (
              <div>
                <h2 style={sectionHeaderStyle}>
                  <span style={{ width: 14, height: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem" }}>$</span>
                  Orchestrator Wallet
                </h2>
                <WalletBalances wallets={plannerWallet} />
              </div>
            )}
          </div>

          {/* Right: Mission Control */}
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

      {/* Email Chain */}
      <div style={{ padding: "16px 24px 0" }}>
        <h2 style={sectionHeaderStyle}>
          <Mail size={14} style={{ color: "#818cf8" }} />
          Agent Email Chain
          {state.emails.length > 0 && (
            <span style={{
              fontWeight: 500, color: "#818cf8", fontSize: "0.62rem",
              marginLeft: 6, padding: "1px 6px", borderRadius: 10,
              background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)",
            }}>
              {state.emails.length}
            </span>
          )}
        </h2>
        <div style={{
          background: "#0f0f18", borderRadius: 12,
          border: "1px solid #1e293b", overflow: "hidden",
          minHeight: 60,
        }}>
          {state.emails.length > 0 ? (
            <EmailChainView emails={state.emails} />
          ) : (
            <div style={{
              padding: "24px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
            }}>
              <Mail size={18} style={{ color: "#1e293b" }} />
              <span style={{ fontSize: "0.72rem", color: "#334155" }}>
                Agent emails will appear here as they communicate
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom spacer */}
      <div style={{ height: 24 }} />
    </div>
  );
}
