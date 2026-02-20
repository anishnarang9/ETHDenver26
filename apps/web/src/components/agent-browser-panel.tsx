"use client";

interface BrowserPanel {
  agentId: string;
  liveViewUrl?: string;
  status: "standby" | "active" | "closed" | "revoked";
}

const statusColors: Record<string, string> = {
  standby: "#64748b",
  active: "#22c55e",
  closed: "#94a3b8",
  revoked: "#ef4444",
};

export function AgentBrowserPanel({ agentId, label, browser, thought }: {
  agentId: string;
  label: string;
  browser?: BrowserPanel;
  thought?: string;
}) {
  const status = browser?.status || "standby";
  const color = statusColors[status] || "#64748b";

  return (
    <div style={{ background: "#111827", borderRadius: "12px", border: "1px solid #1e293b", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #1e293b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, boxShadow: status === "active" ? `0 0 8px ${color}` : "none" }} />
          <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{label}</span>
        </div>
        <span style={{ fontSize: "0.72rem", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>{status}</span>
      </div>

      {/* Browser iframe or placeholder */}
      <div style={{ height: 240, background: "#0f172a", position: "relative" }}>
        {browser?.liveViewUrl && status === "active" ? (
          <iframe
            src={browser.liveViewUrl}
            style={{ width: "100%", height: "100%", border: "none" }}
            sandbox="allow-scripts allow-same-origin"
            title={`${label} browser`}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#334155", fontSize: "0.85rem" }}>
            {status === "revoked" ? "REVOKED" : "Standby"}
          </div>
        )}
        {status === "revoked" && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(239, 68, 68, 0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#ef4444", fontWeight: 700, fontSize: "1.2rem", textTransform: "uppercase" }}>REVOKED</span>
          </div>
        )}
      </div>

      {/* Thought bubble */}
      {thought && (
        <div style={{ padding: "8px 14px", borderTop: "1px solid #1e293b", fontSize: "0.78rem", color: "#94a3b8", maxHeight: 60, overflow: "auto" }}>
          {thought}
        </div>
      )}
    </div>
  );
}
