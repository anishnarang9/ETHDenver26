"use client";

interface Step {
  step: number;
  name: string;
  status: "pending" | "pass" | "fail";
  detail?: string;
}

const PIPELINE_LABELS = [
  "Identity", "Nonce", "Session", "Passport", "Scope",
  "Service", "Rate Limit", "Budget", "Quote", "Payment",
];

export function EnforcementPipeline({ steps }: { steps: Step[] }) {
  return (
    <div style={{ background: "#111827", borderRadius: "12px", border: "1px solid #1e293b", padding: "14px" }}>
      <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem", color: "#94a3b8" }}>Enforcement Pipeline</h3>
      <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
        {PIPELINE_LABELS.map((label, idx) => {
          const matchedStep = steps.find((s) => s.step === idx + 1);
          const status = matchedStep?.status || "pending";
          const bg = status === "pass" ? "#22c55e" : status === "fail" ? "#ef4444" : "#1e293b";
          const glow = status === "fail" ? "0 0 12px rgba(239,68,68,0.5)" : status === "pass" ? "0 0 6px rgba(34,197,94,0.3)" : "none";

          return (
            <div key={label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{
                height: 28,
                borderRadius: "6px",
                background: bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.6rem",
                fontWeight: 600,
                color: status === "pending" ? "#475569" : "#fff",
                transition: "all 0.3s ease",
                boxShadow: glow,
              }}>
                {idx + 1}
              </div>
              <div style={{ fontSize: "0.55rem", color: "#64748b", marginTop: 3 }}>{label}</div>
            </div>
          );
        })}
      </div>
      {steps.length > 0 && steps[steps.length - 1]?.status === "fail" && (
        <div style={{ marginTop: 8, padding: "6px 10px", background: "#450a0a", borderRadius: "6px", fontSize: "0.75rem", color: "#fca5a5" }}>
          {steps[steps.length - 1]?.name}: {steps[steps.length - 1]?.detail || "Blocked"}
        </div>
      )}
    </div>
  );
}
