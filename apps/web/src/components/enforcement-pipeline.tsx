"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Circle, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface Step {
  step: number;
  name: string;
  status: "pending" | "pass" | "fail";
  detail?: string;
}

const PIPELINE_LABELS = [
  "Passport",
  "Session",
  "Scope",
  "Service",
  "Nonce",
  "Quote",
  "Payment",
  "Budget",
  "Rate",
  "Receipt",
];

function StepIcon({ status }: { status: "pending" | "pass" | "fail" | "processing" }) {
  const size = 14;
  if (status === "pass") return <CheckCircle2 size={size} color="#fff" strokeWidth={2.5} />;
  if (status === "fail") return <XCircle size={size} color="#fff" strokeWidth={2.5} />;
  if (status === "processing")
    return (
      <Loader2
        size={size}
        color="#60a5fa"
        strokeWidth={2.5}
        style={{ animation: "spin 1s linear infinite" }}
      />
    );
  return <Circle size={size} color="#475569" strokeWidth={2} />;
}

function resolveStepStatus(
  idx: number,
  steps: Step[],
): "pending" | "pass" | "fail" | "processing" {
  const matched = steps.find((s) => s.step === idx + 1);
  if (matched) return matched.status === "pass" ? "pass" : "fail";

  // If prior step exists and passed, and this step has no data yet,
  // treat the very next unresolved step as "processing" for visual feedback
  const maxResolved = steps.length > 0 ? Math.max(...steps.map((s) => s.step)) : 0;
  if (idx + 1 === maxResolved + 1 && steps.length > 0) {
    const lastStep = steps[steps.length - 1];
    if (lastStep && lastStep.status === "pass") return "processing";
  }
  return "pending";
}

export function EnforcementPipeline({ steps }: { steps: Step[] }) {
  const passedCount = steps.filter((s) => s.status === "pass").length;
  const totalSteps = PIPELINE_LABELS.length;
  const progressPercent = (passedCount / totalSteps) * 100;
  const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
  const hasFailed = lastStep?.status === "fail";

  return (
    <div
      style={{
        background: "#111827",
        borderRadius: "12px",
        border: "1px solid #1e293b",
        padding: "14px",
      }}
    >
      {/* Inline keyframes for Loader2 spin */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "0.9rem", color: "#94a3b8", fontWeight: 600 }}>
          Enforcement Pipeline
        </h3>
        <span
          style={{
            fontSize: "0.7rem",
            color: hasFailed ? "#f87171" : passedCount > 0 ? "#4ade80" : "#475569",
            fontWeight: 500,
          }}
        >
          {hasFailed
            ? "BLOCKED"
            : passedCount === totalSteps
              ? "ALL CLEAR"
              : passedCount > 0
                ? `${passedCount}/${totalSteps} passed`
                : "Awaiting"}
        </span>
      </div>

      {/* Progress bar track */}
      <div
        style={{
          height: 3,
          borderRadius: 2,
          background: "#1e293b",
          marginBottom: "10px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <motion.div
          style={{
            height: "100%",
            borderRadius: 2,
            background: hasFailed
              ? "linear-gradient(90deg, #22c55e, #ef4444)"
              : "linear-gradient(90deg, #22c55e, #4ade80)",
          }}
          initial={{ width: "0%" }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
        {/* Shimmer overlay on the progress bar when actively processing */}
        {passedCount > 0 && passedCount < totalSteps && !hasFailed && (
          <motion.div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: "30%",
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
              borderRadius: 2,
            }}
            animate={{ x: ["-100%", "400%"] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          />
        )}
      </div>

      {/* Step indicators */}
      <div style={{ display: "flex", gap: "4px", alignItems: "flex-start" }}>
        {PIPELINE_LABELS.map((label, idx) => {
          const status = resolveStepStatus(idx, steps);
          const matchedStep = steps.find((s) => s.step === idx + 1);

          const bgMap = {
            pass: "#22c55e",
            fail: "#ef4444",
            processing: "#1e3a5f",
            pending: "#1e293b",
          };
          const bg = bgMap[status];

          const borderMap = {
            pass: "1px solid rgba(34,197,94,0.4)",
            fail: "1px solid rgba(239,68,68,0.5)",
            processing: "1px solid rgba(96,165,250,0.4)",
            pending: "1px solid transparent",
          };

          const glowMap = {
            pass: "0 0 8px rgba(34,197,94,0.4)",
            fail: "0 0 14px rgba(239,68,68,0.6)",
            processing: "0 0 8px rgba(96,165,250,0.3)",
            pending: "none",
          };

          // Animation variants by status
          const animateProps =
            status === "pass"
              ? { scale: [1, 1.15, 1], opacity: 1 }
              : status === "fail"
                ? { x: [0, -4, 4, -4, 4, 0], opacity: 1 }
                : status === "processing"
                  ? { opacity: [0.6, 1, 0.6] }
                  : { opacity: 0.55 };

          const transitionProps =
            status === "pass"
              ? { duration: 0.5, ease: "easeOut" as const }
              : status === "fail"
                ? { duration: 0.5, ease: "easeOut" as const }
                : status === "processing"
                  ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" as const }
                  : { duration: 0.3 };

          return (
            <motion.div
              key={label}
              style={{ flex: 1, textAlign: "center" as const }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.3 }}
            >
              <motion.div
                style={{
                  height: 32,
                  borderRadius: "8px",
                  background: bg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "3px",
                  fontSize: "0.6rem",
                  fontWeight: 600,
                  color: status === "pending" ? "#475569" : "#fff",
                  boxShadow: glowMap[status],
                  border: borderMap[status],
                  cursor: "default",
                  position: "relative" as const,
                  overflow: "hidden",
                }}
                animate={animateProps}
                transition={transitionProps}
                whileHover={{ scale: 1.06, transition: { duration: 0.15 } }}
              >
                {/* Background pulse ring for pass/fail */}
                <AnimatePresence>
                  {(status === "pass" || status === "fail") && (
                    <motion.div
                      style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "8px",
                        background:
                          status === "pass"
                            ? "rgba(34,197,94,0.3)"
                            : "rgba(239,68,68,0.3)",
                      }}
                      initial={{ opacity: 0.8, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.5 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  )}
                </AnimatePresence>

                <StepIcon status={status} />
              </motion.div>

              {/* Label */}
              <motion.div
                style={{
                  fontSize: "0.52rem",
                  color:
                    status === "pass"
                      ? "#4ade80"
                      : status === "fail"
                        ? "#f87171"
                        : "#64748b",
                  marginTop: 4,
                  fontWeight: status === "pending" ? 400 : 500,
                  letterSpacing: "0.01em",
                }}
                animate={{
                  color:
                    status === "pass"
                      ? "#4ade80"
                      : status === "fail"
                        ? "#f87171"
                        : "#64748b",
                }}
                transition={{ duration: 0.3 }}
              >
                {label}
              </motion.div>

              {/* Detail tooltip for failed step */}
              <AnimatePresence>
                {status === "fail" && matchedStep?.detail && (
                  <motion.div
                    style={{
                      fontSize: "0.48rem",
                      color: "#fca5a5",
                      marginTop: 2,
                      lineHeight: 1.2,
                    }}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {matchedStep.detail}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Failure banner */}
      <AnimatePresence>
        {hasFailed && lastStep && (
          <motion.div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "linear-gradient(135deg, #450a0a, #7f1d1d)",
              borderRadius: "8px",
              fontSize: "0.75rem",
              color: "#fca5a5",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid rgba(239,68,68,0.3)",
            }}
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <XCircle size={14} color="#f87171" />
            <span>
              <strong>Step {lastStep.step} &mdash; {lastStep.name}:</strong>{" "}
              {lastStep.detail || "Blocked"}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* All-clear banner */}
      <AnimatePresence>
        {passedCount === totalSteps && !hasFailed && steps.length > 0 && (
          <motion.div
            style={{
              marginTop: 10,
              padding: "8px 12px",
              background: "linear-gradient(135deg, #052e16, #14532d)",
              borderRadius: "8px",
              fontSize: "0.75rem",
              color: "#86efac",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              border: "1px solid rgba(34,197,94,0.3)",
            }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <CheckCircle2 size={14} color="#4ade80" />
            <span>All 10 enforcement checks passed</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
