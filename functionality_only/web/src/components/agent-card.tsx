"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Maximize2, X, Monitor } from "lucide-react";
import type { SpawnedAgentInfo } from "../lib/sse-context";

/* ─── Spawn step constants (reused from agent-spawn-timeline) ─── */

const SPAWN_STEPS = ["wallet_created", "funded", "passport_deployed", "session_granted"] as const;

const stepLabels: Record<string, string> = {
  wallet_created: "Wallet",
  funded: "Funded",
  passport_deployed: "Passport",
  session_granted: "Session",
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

/* ─── Status → border glow color ─── */

const statusGlow: Record<string, string> = {
  spawning: "#f59e0b",
  active: "#22c55e",
  completed: "#8b5cf6",
  failed: "#ef4444",
  revoked: "#ef4444",
};

/* ─── Tx Link ─── */

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

/* ─── Full-screen browser overlay ─── */

function FullScreenOverlay({
  liveViewUrl,
  label,
  onClose,
}: {
  liveViewUrl: string;
  label: string;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: "1px solid #1e293b",
        }}
      >
        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#e2e8f0" }}>
          {label} — Browser
        </span>
        <button
          onClick={onClose}
          style={{
            background: "#1e293b",
            border: "none",
            borderRadius: 8,
            padding: "6px 12px",
            color: "#e2e8f0",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: "0.78rem",
          }}
        >
          <X size={14} /> Close
        </button>
      </div>
      <iframe
        src={liveViewUrl}
        style={{ flex: 1, width: "100%", border: "none" }}
        sandbox="allow-scripts allow-same-origin"
        title={`${label} fullscreen browser`}
      />
    </motion.div>
  );
}

/* ─── Agent Card ─── */

export function AgentCard({
  agent,
  browser,
  thought,
}: {
  agent: SpawnedAgentInfo;
  browser?: { liveViewUrl?: string; status: string };
  thought?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const currentStep = getStepIndex(agent.step);
  const isActive = agent.status === "active";
  const isCompleted = agent.status === "completed";
  const isFailed = agent.status === "failed";
  const glowColor = statusGlow[agent.status] || "#1e293b";
  const browserActive = browser?.status === "active" && browser?.liveViewUrl;

  return (
    <>
      {/* Full-screen overlay */}
      <AnimatePresence>
        {expanded && browser?.liveViewUrl && (
          <FullScreenOverlay
            liveViewUrl={browser.liveViewUrl}
            label={agent.role}
            onClose={() => setExpanded(false)}
          />
        )}
      </AnimatePresence>

      <motion.div
        layout
        initial={{ opacity: 0, y: 30, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 340, damping: 28 }}
        style={{
          background: "#111827",
          borderRadius: 14,
          border: `1px solid ${glowColor}50`,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Animated glow border for active/spawning */}
        {(isActive || agent.status === "spawning") && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 14,
              pointerEvents: "none",
              animation: "pulse-glow 2.5s ease-in-out infinite",
              ["--glow-color" as string]: glowColor,
            } as React.CSSProperties}
          />
        )}

        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid #1e293b",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: glowColor,
                boxShadow: isActive ? `0 0 8px ${glowColor}` : "none",
              }}
            />
            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#e2e8f0" }}>
              {agent.role}
            </span>
          </div>
          <span
            style={{
              fontSize: "0.62rem",
              padding: "2px 8px",
              borderRadius: 6,
              background: `${glowColor}20`,
              color: glowColor,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {isCompleted && <CheckCircle2 size={10} style={{ marginRight: 3, verticalAlign: "middle" }} />}
            {agent.status}
          </span>
        </div>

        {/* ── Spawn Progress ── */}
        <div style={{ padding: "8px 14px 4px" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
            {SPAWN_STEPS.map((step, i) => {
              const done = i <= currentStep;
              return (
                <div
                  key={step}
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 2,
                    background: done ? stepColors[step] : "#1e293b",
                    transition: "background 0.4s ease",
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {SPAWN_STEPS.map((step, i) => {
              const done = i <= currentStep;
              return (
                <span
                  key={step}
                  style={{
                    fontSize: "0.55rem",
                    padding: "1px 5px",
                    borderRadius: 4,
                    background: done ? `${stepColors[step]}20` : "transparent",
                    color: done ? stepColors[step] : "#334155",
                    fontWeight: done ? 600 : 400,
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                  }}
                >
                  {done && <CheckCircle2 size={8} />}
                  {stepLabels[step]}
                </span>
              );
            })}
          </div>
        </div>

        {/* ── Browser Viewport ── */}
        <div style={{ height: 200, background: "#0a0a12", position: "relative", margin: "8px 0 0" }}>
          {browserActive ? (
            <>
              <iframe
                src={browser.liveViewUrl}
                style={{ width: "100%", height: "100%", border: "none" }}
                sandbox="allow-scripts allow-same-origin"
                title={`${agent.role} browser`}
              />
              <button
                onClick={() => setExpanded(true)}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  background: "rgba(0,0,0,0.7)",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: "4px 8px",
                  color: "#e2e8f0",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: "0.65rem",
                  zIndex: 2,
                }}
              >
                <Maximize2 size={10} /> Expand
              </button>
            </>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "#1e293b",
                gap: 6,
              }}
            >
              <Monitor size={24} />
              <span style={{ fontSize: "0.7rem", color: "#334155" }}>
                {isFailed ? "Failed" : "Awaiting browser session..."}
              </span>
            </div>
          )}
        </div>

        {/* ── Thought Bubble ── */}
        <AnimatePresence mode="wait">
          {thought && (
            <motion.div
              key={thought}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                padding: "8px 14px",
                borderTop: "1px solid #1e293b",
                fontSize: "0.75rem",
                fontStyle: "italic",
                color: "#94a3b8",
                display: "flex",
                alignItems: "center",
                gap: 6,
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                {thought}
              </span>
              <span
                style={{
                  display: "inline-block",
                  width: 5,
                  height: 12,
                  background: "#94a3b8",
                  borderRadius: 1,
                  flexShrink: 0,
                  animation: "cursor-blink 1s step-end infinite",
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Tx Links ── */}
        {(agent.fundingTxHash || agent.passportTxHash || agent.sessionTxHash) && (
          <div
            style={{
              padding: "6px 14px 10px",
              display: "flex",
              flexWrap: "wrap",
              gap: "2px 12px",
              borderTop: "1px solid #1e293b",
            }}
          >
            {agent.fundingTxHash && <TxLink label="Fund" hash={agent.fundingTxHash} />}
            {agent.passportTxHash && <TxLink label="Passport" hash={agent.passportTxHash} />}
            {agent.sessionTxHash && <TxLink label="Session" hash={agent.sessionTxHash} />}
          </div>
        )}
      </motion.div>
    </>
  );
}
