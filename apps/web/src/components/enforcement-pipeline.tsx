"use client";

import { ENFORCEMENT_LABELS } from "../lib/types";
import type { EnforcementStep } from "../lib/types";

export function EnforcementPipeline({ steps }: { steps: EnforcementStep[] }) {
  if (steps.length === 0) {
    return <div className="event-item">Awaiting enforcement evidence.</div>;
  }

  return (
    <div className="timeline-list">
      {steps.map((step) => (
        <div key={`${step.step}-${step.name}`} className="event-item">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>
              {step.step}. {ENFORCEMENT_LABELS[step.name] || step.name}
            </strong>
            <span className={`badge ${step.status === "pass" ? "ok" : step.status === "fail" ? "danger" : "warn"}`}>
              {step.status}
            </span>
          </div>
          {step.detail && (
            <div style={{ marginTop: 4, color: "var(--text-2)", fontSize: 12 }}>{step.detail}</div>
          )}
        </div>
      ))}
    </div>
  );
}
