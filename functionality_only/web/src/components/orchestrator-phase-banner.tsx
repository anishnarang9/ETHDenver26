"use client";

import { motion } from "framer-motion";

const PHASES = ["planning", "spawning", "executing", "synthesizing"] as const;
type Phase = (typeof PHASES)[number];

const phaseConfig: Record<Phase, { label: string; color: string }> = {
  planning: { label: "Planning", color: "#3b82f6" },
  spawning: { label: "Spawning", color: "#f59e0b" },
  executing: { label: "Executing", color: "#22c55e" },
  synthesizing: { label: "Synthesizing", color: "#8b5cf6" },
};

function phaseIndex(p: string): number {
  return PHASES.indexOf(p as Phase);
}

export function OrchestratorPhaseBanner({
  phase,
  plannerThought,
}: {
  phase: string;
  plannerThought?: string;
}) {
  const activeIdx = phase === "completed" ? PHASES.length : phaseIndex(phase);

  return (
    <div
      style={{
        margin: "0 24px",
        padding: "18px 20px 14px",
        background: "#0d1117",
        borderRadius: 12,
        border: "1px solid #1e293b",
      }}
    >
      {/* Phase dots + connecting lines */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
        }}
      >
        {PHASES.map((p, i) => {
          const cfg = phaseConfig[p];
          const isCompleted = i < activeIdx;
          const isActive = i === activeIdx;
          const isPending = i > activeIdx;

          return (
            <div key={p} style={{ display: "flex", alignItems: "center", flex: 1 }}>
              {/* Node */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", zIndex: 2 }}>
                <motion.div
                  animate={
                    isActive
                      ? {
                          scale: [1, 1.15, 1],
                          boxShadow: [
                            `0 0 8px 2px ${cfg.color}66`,
                            `0 0 20px 6px ${cfg.color}99`,
                            `0 0 8px 2px ${cfg.color}66`,
                          ],
                        }
                      : {}
                  }
                  transition={isActive ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : {}}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isCompleted
                      ? cfg.color
                      : isActive
                        ? `${cfg.color}30`
                        : "#1e293b",
                    border: `2px solid ${isCompleted || isActive ? cfg.color : "#334155"}`,
                    transition: "background 0.4s ease, border-color 0.4s ease",
                  }}
                >
                  {isCompleted ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        color: isActive ? cfg.color : "#475569",
                      }}
                    >
                      {i + 1}
                    </span>
                  )}
                </motion.div>

                {/* Label */}
                <span
                  style={{
                    marginTop: 6,
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: isCompleted || isActive ? cfg.color : "#475569",
                    transition: "color 0.4s ease",
                  }}
                >
                  {cfg.label}
                </span>
              </div>

              {/* Connecting line (not after last) */}
              {i < PHASES.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    margin: "0 8px",
                    marginBottom: 22,
                    background: "#1e293b",
                    borderRadius: 1,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: i < activeIdx ? "100%" : "0%" }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    style={{
                      height: "100%",
                      background: `linear-gradient(90deg, ${phaseConfig[PHASES[i]!].color}, ${phaseConfig[PHASES[i + 1]!].color})`,
                      borderRadius: 1,
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Planner thought text */}
      {plannerThought && (
        <motion.div
          key={plannerThought}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            marginTop: 12,
            padding: "8px 12px",
            background: "#111827",
            borderRadius: 8,
            fontSize: "0.75rem",
            fontStyle: "italic",
            color: "#94a3b8",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: "#64748b", flexShrink: 0, fontSize: "0.65rem" }}>THOUGHT</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{plannerThought}</span>
          <span
            style={{
              display: "inline-block",
              width: 6,
              height: 14,
              background: "#94a3b8",
              borderRadius: 1,
              flexShrink: 0,
              animation: "cursor-blink 1s step-end infinite",
            }}
          />
        </motion.div>
      )}
    </div>
  );
}
