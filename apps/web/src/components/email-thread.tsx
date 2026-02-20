"use client";

interface Email {
  id: string;
  from: string;
  to?: string;
  subject: string;
  body: string;
  timestamp: string;
  agentId: string;
}

const agentColors: Record<string, string> = {
  planner: "#818cf8",
  rider: "#38bdf8",
  foodie: "#34d399",
  eventbot: "#fb923c",
  human: "#f472b6",
};

export function EmailThread({ emails }: { emails: Email[] }) {
  return (
    <div style={{ background: "#111827", borderRadius: "12px", border: "1px solid #1e293b", padding: "14px", maxHeight: 300, overflow: "auto" }}>
      <h3 style={{ margin: "0 0 10px", fontSize: "0.9rem", color: "#94a3b8" }}>Email Thread</h3>
      {emails.length === 0 ? (
        <p style={{ color: "#334155", fontSize: "0.8rem" }}>Waiting for emails...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {emails.map((email) => (
            <div key={email.id} style={{ padding: "8px 10px", background: "#0f172a", borderRadius: "8px", borderLeft: `3px solid ${agentColors[email.agentId] || "#64748b"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#64748b" }}>
                <span><strong style={{ color: agentColors[email.agentId] || "#94a3b8" }}>{email.from}</strong>{email.to ? ` → ${email.to}` : ""}</span>
                <span>{new Date(email.timestamp).toLocaleTimeString()}</span>
              </div>
              {email.subject && <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#e2e8f0", margin: "2px 0" }}>{email.subject}</div>}
              <div style={{ fontSize: "0.75rem", color: "#94a3b8", whiteSpace: "pre-wrap", maxHeight: 80, overflow: "auto" }}>{email.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
