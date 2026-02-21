"use client";

export function ThoughtBubble({ text, agentId }: { text?: string; agentId: string }) {
  if (!text) return null;

  return (
    <div style={{ padding: "8px 12px", background: "#1e293b", borderRadius: "8px", fontSize: "0.8rem", color: "#94a3b8", fontStyle: "italic", position: "relative" }}>
      <span style={{ fontWeight: 600, color: "#818cf8", marginRight: 6 }}>{agentId}:</span>
      {text}
    </div>
  );
}
