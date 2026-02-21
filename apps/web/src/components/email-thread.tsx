"use client";

import type { EmailEvent } from "../lib/types";

export function EmailThread({ emails }: { emails: EmailEvent[] }) {
  if (emails.length === 0) {
    return <div className="event-item">Waiting for agent or human emails.</div>;
  }

  return (
    <div className="email-list">
      {emails.slice().reverse().map((email) => (
        <div key={email.id} className="email-item">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <strong>{email.from}</strong>
            <span className="mono" style={{ color: "var(--text-2)", fontSize: 11 }}>
              {new Date(email.timestamp).toLocaleTimeString()}
            </span>
          </div>
          {email.subject && <div style={{ marginTop: 3, fontSize: 13 }}>{email.subject}</div>}
          <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-2)", whiteSpace: "pre-wrap" }}>{email.body}</div>
        </div>
      ))}
    </div>
  );
}
