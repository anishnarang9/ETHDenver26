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

  return (
    <div className="agent-card">
      <div className="agent-head">
        <strong>{label}</strong>
        <span className="badge" style={{ color: statusPalette[status], borderColor: `${statusPalette[status]}66` }}>
          {status}
        </span>
      </div>
      <div className="agent-body">
        {browser?.liveViewUrl && status === "active" ? (
          <iframe
            src={browser.liveViewUrl}
            title={`${label} browser`}
            style={{ width: "100%", height: "100%", border: "none" }}
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <div style={{ display: "grid", placeItems: "center", height: "100%", color: "var(--text-2)", fontSize: 12 }}>
            {status === "revoked" ? "Agent access revoked" : "No active live browser stream"}
          </div>
        )}
      </div>
      {thought && (
        <div style={{ borderTop: "1px solid var(--line)", padding: "8px", fontSize: 12, color: "var(--text-1)" }}>
          {thought}
        </div>
      )}
    </div>
  );
}
