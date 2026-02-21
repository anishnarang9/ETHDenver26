"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { SpawnedAgentInfo } from "../lib/sse-context";

const SPAWN_STEPS = ["wallet_created", "funded", "passport_deployed", "session_granted"] as const;

const stepLabels: Record<string, string> = {
  wallet_created: "Wallet Created",
  funded: "Funded",
  passport_deployed: "Passport Deployed",
  session_granted: "Session Granted",
};

const stepColors: Record<string, string> = {
  wallet_created: "#3b82f6",
  funded: "#22c55e",
  passport_deployed: "#8b5cf6",
  session_granted: "#f59e0b",
};

function getStepIndex(step?: string): number {
  if (!step) return -1;
  return SPAWN_STEPS.indexOf(step as (typeof SPAWN_STEPS)[number]);
}

function AgentSpawnCard({ agent }: { agent: SpawnedAgentInfo }) {
  const currentStep = getStepIndex(agent.step);
  const isActive = agent.status === "active" || agent.status === "completed";
  const isFailed = agent.status === "failed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        background: "#111827",
        borderRadius: 10,
        border: `1px solid ${isFailed ? "#ef4444" : isActive ? "#22c55e" : "#1e293b"}`,
        padding: "12px 14px",
        minWidth: 200,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: isFailed ? "#ef4444" : isActive ? "#22c55e" : "#f59e0b",
              boxShadow: isActive ? "0 0 8px #22c55e" : undefined,
            }}
          />
          <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "#e2e8f0" }}>{agent.role}</span>
        </div>
        <span
          style={{
            fontSize: "0.65rem",
            color: isFailed ? "#ef4444" : isActive ? "#22c55e" : "#94a3b8",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {agent.status}
        </span>
      </div>

      {/* Address */}
      {agent.address && (
        <div style={{ fontSize: "0.6rem", fontFamily: "monospace", color: "#475569", marginBottom: 8 }}>
          {agent.address.slice(0, 10)}...{agent.address.slice(-6)}
        </div>
      )}

      {/* Step progress */}
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        {SPAWN_STEPS.map((step, i) => (
          <div
            key={step}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= currentStep ? stepColors[step] : "#1e293b",
              transition: "background 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* Step labels */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {SPAWN_STEPS.map((step, i) => {
          const done = i <= currentStep;
          const isCurrent = i === currentStep;
          return (
            <AnimatePresence key={step}>
              {(done || isCurrent) && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    fontSize: "0.58rem",
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: done ? `${stepColors[step]}20` : "#1e293b",
                    color: done ? stepColors[step] : "#64748b",
                    border: `1px solid ${done ? `${stepColors[step]}40` : "transparent"}`,
                  }}
                >
                  {stepLabels[step]}
                </motion.span>
              )}
            </AnimatePresence>
          );
        })}
      </div>

      {/* Tx hashes */}
      {(agent.fundingTxHash || agent.passportTxHash || agent.sessionTxHash) && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
          {agent.fundingTxHash && (
            <TxLink label="Fund" hash={agent.fundingTxHash} />
          )}
          {agent.passportTxHash && (
            <TxLink label="Passport" hash={agent.passportTxHash} />
          )}
          {agent.sessionTxHash && (
            <TxLink label="Session" hash={agent.sessionTxHash} />
          )}
        </div>
      )}
    </motion.div>
  );
}

function TxLink({ label, hash }: { label: string; hash: string }) {
  return (
    <a
      href={`https://testnet.kitescan.ai/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        fontSize: "0.55rem",
        fontFamily: "monospace",
        color: "#64748b",
        textDecoration: "none",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      <span style={{ color: "#94a3b8" }}>{label}:</span>
      {hash.slice(0, 10)}...
    </a>
  );
}

export function AgentSpawnTimeline({ agents }: { agents: SpawnedAgentInfo[] }) {
  if (agents.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {agents.map((agent) => (
        <AgentSpawnCard key={agent.id} agent={agent} />
      ))}
    </div>
  );
}
