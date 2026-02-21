"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowRight } from "lucide-react";

function agentColor(agentId: string): string {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) hash = agentId.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return "hsl(" + hue + ", 70%, 65%)";
}

function shortAddress(addr: string): string {
  if (!addr) return "unknown";
  const atIdx = addr.indexOf("@");
  if (atIdx > 0) return addr.slice(0, atIdx);
  if (addr.length > 20) return addr.slice(0, 8) + "..." + addr.slice(-4);
  return addr;
}

interface EmailEntry {
  id: string;
  from: string;
  to?: string;
  subject: string;
  body: string;
  timestamp: string;
  agentId: string;
}

export function EmailChainView({
  emails,
  filterFromAgent,
  title,
}: {
  emails: EmailEntry[];
  filterFromAgent?: string;
  title?: string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const filtered = filterFromAgent
    ? emails.filter((e) => e.agentId === filterFromAgent)
    : emails;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filtered.length]);

  if (filtered.length === 0) {
    return (
      <div
        style={{
          padding: "24px",
          textAlign: "center",
          color: "#475569",
          fontSize: "0.82rem",
          fontStyle: "italic",
        }}
      >
        <Mail size={20} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
        No emails yet
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {title && (
        <div
          style={{
            padding: "8px 12px",
            fontSize: "0.72rem",
            fontWeight: 600,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            borderBottom: "1px solid #1e293b",
          }}
        >
          {title}
        </div>
      )}
      <div style={{ maxHeight: 300, overflowY: "auto", padding: "8px 0" }}>
        <AnimatePresence>
          {filtered.map((email) => {
            const color = agentColor(email.agentId);
            return (
              <motion.div
                key={email.id}
                initial={{ opacity: 0, x: -20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: "auto" }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid rgba(30,41,59,0.4)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 4,
                    fontSize: "0.75rem",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ color, fontWeight: 600 }}>
                    {shortAddress(email.from || email.agentId)}
                  </span>
                  {email.to && (
                    <>
                      <ArrowRight size={10} style={{ color: "#475569" }} />
                      <span style={{ color: "#94a3b8" }}>{shortAddress(email.to)}</span>
                    </>
                  )}
                  <span style={{ marginLeft: "auto", color: "#475569", fontSize: "0.68rem" }}>
                    {new Date(email.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {email.subject && (
                  <div
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      color: "#cbd5e1",
                      marginBottom: 4,
                    }}
                  >
                    {email.subject}
                  </div>
                )}
                <div
                  style={{
                    fontSize: "0.76rem",
                    color: "#94a3b8",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    maxHeight: 120,
                    overflow: "hidden",
                  }}
                >
                  {email.body?.slice(0, 500)}
                  {(email.body?.length || 0) > 500 && "..."}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
