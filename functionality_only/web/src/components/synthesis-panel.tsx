"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Loader2, Clock } from "lucide-react";

export function SynthesisPanel({
  phase,
  plannerThought,
  synthesisBody,
}: {
  phase: string;
  plannerThought?: string;
  synthesisBody?: string;
}) {
  const isSynthesizing = phase === "synthesizing";
  const isCompleted = phase === "completed";
  const isWaiting = !isSynthesizing && !isCompleted;

  const borderColor = isCompleted ? "#22c55e" : isSynthesizing ? "#8b5cf6" : "#1e293b";

  return (
    <div
      style={{
        background: "#111827",
        borderRadius: 12,
        border: `1px solid ${borderColor}`,
        padding: 14,
        position: "relative",
        overflow: "hidden",
        minHeight: 120,
      }}
    >
      {/* Shimmer overlay during synthesis */}
      {isSynthesizing && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 12,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, transparent, rgba(139,92,246,0.08), transparent)",
              animation: "shimmer 2s ease-in-out infinite",
            }}
          />
        </div>
      )}

      {/* Completed glow */}
      {isCompleted && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 12,
            pointerEvents: "none",
            boxShadow: "inset 0 0 30px rgba(34,197,94,0.08)",
          }}
        />
      )}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        {isCompleted ? (
          <CheckCircle2 size={16} style={{ color: "#22c55e" }} />
        ) : isSynthesizing ? (
          <Loader2
            size={16}
            style={{ color: "#8b5cf6", animation: "spin 1s linear infinite" }}
          />
        ) : (
          <Clock size={16} style={{ color: "#334155" }} />
        )}
        <h3
          style={{
            margin: 0,
            fontSize: "0.9rem",
            fontWeight: 600,
            color: isCompleted ? "#22c55e" : isSynthesizing ? "#8b5cf6" : "#334155",
          }}
        >
          {isCompleted
            ? "Itinerary Complete"
            : isSynthesizing
              ? "Compiling itinerary..."
              : "Waiting for agents..."}
        </h3>
      </div>

      {/* Inline spin keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Content */}
      <AnimatePresence mode="wait">
        {isCompleted && synthesisBody ? (
          <motion.div
            key="body"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              fontSize: "0.78rem",
              color: "#cbd5e1",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              maxHeight: 280,
              overflow: "auto",
              padding: "8px 10px",
              background: "#0a0f1a",
              borderRadius: 8,
            }}
          >
            {synthesisBody}
          </motion.div>
        ) : isSynthesizing && plannerThought ? (
          <motion.div
            key="thought"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{
              fontSize: "0.75rem",
              fontStyle: "italic",
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>{plannerThought}</span>
            <span
              style={{
                display: "inline-block",
                width: 5,
                height: 12,
                background: "#8b5cf6",
                borderRadius: 1,
                flexShrink: 0,
                animation: "cursor-blink 1s step-end infinite",
              }}
            />
          </motion.div>
        ) : isWaiting ? (
          <motion.p
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            style={{ fontSize: "0.75rem", color: "#334155", margin: 0 }}
          >
            Agents are still executing tasks. The synthesis will begin once all results are in.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
