"use client";

import type { BrowserPanelState } from "../lib/types";

const statusPalette: Record<BrowserPanelState["status"], string> = {
  standby: "var(--text-2)",
  active: "var(--ok)",
  closed: "var(--warn)",
  revoked: "var(--danger)",
};

export function AgentBrowserPanel({
  label,
  browser,
  thought,
}: {
  label: string;
  browser?: BrowserPanelState;
  thought?: string;
}) {
  const status = browser?.status || "standby";
  const liveViewUrl = browser?.liveViewUrl || "";
  const hasVideo = Boolean(browser?.liveViewUrl && status === "active");
  const hasOutput = Boolean(thought?.trim());
  const textOnlyMode = !hasVideo && hasOutput;

  return (
    <div className="agent-card">
      <div className="agent-head">
        <strong>{label}</strong>
        <span className="badge" style={{ color: statusPalette[status], borderColor: `${statusPalette[status]}66` }}>
          {status}
        </span>
      </div>
      <div className="agent-body">
        {hasVideo ? (
          <iframe
            src={liveViewUrl}
            title={`${label} browser`}
            style={{ width: "100%", height: "100%", border: "none" }}
            sandbox="allow-scripts allow-same-origin"
          />
        ) : textOnlyMode ? (
          <div
            style={{
              height: "100%",
              display: "grid",
              alignContent: "start",
              gap: 8,
              padding: 10,
              color: "var(--text-0)",
            }}
          >
            <span className="badge ok" style={{ width: "fit-content" }}>
              Live Output
            </span>
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--text-1)",
                overflow: "auto",
                maxHeight: 156,
              }}
            >
              {thought}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--text-2)", fontSize: 12 }}>
            {status === "revoked" ? "Agent access revoked" : "No active live browser stream"}
          </div>
        )}
      </div>
      {thought && !textOnlyMode && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "8px", fontSize: 12, color: "var(--text-1)" }}>
          {thought}
        </div>
      )}
    </div>
  );
}
