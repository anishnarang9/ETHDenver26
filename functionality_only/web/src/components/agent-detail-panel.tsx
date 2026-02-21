"use client";

import { useSSEState } from "../lib/sse-context";
import { EmailChainView } from "./email-chain-view";
import { Monitor, Mail, Cpu, ExternalLink, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const KITESCAN_BASE = "https://testnet.kitescan.ai/tx/";

export function AgentDetailPanel() {
  const { state } = useSSEState();

  const selectedNode = state.selectedNodeId;
  const selectedEdge = state.selectedEdgeId;

  if (!selectedNode && !selectedEdge) {
    return (
      <div
        style={{
          background: "#0f0f18",
          borderRadius: 12,
          border: "1px solid #1e293b",
          padding: "40px 24px",
          textAlign: "center",
          color: "#475569",
          fontSize: "0.82rem",
        }}
      >
        <Cpu size={24} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
        <div>Click a node or edge in the graph above</div>
        <div style={{ fontSize: "0.72rem", marginTop: 4, color: "#334155" }}>
          Nodes show agent details. Edges show email threads.
        </div>
      </div>
    );
  }

  if (selectedEdge) {
    const parts = selectedEdge.split("--");
    const fromId = parts[0] || "";
    const toId = parts[1] || "";
    const relevantEmails = state.emails.filter((e) => {
      return e.agentId === fromId || e.agentId === toId;
    });
    const fromAgent = state.agentNodes.find((n) => n.id === fromId);
    const toAgent = state.agentNodes.find((n) => n.id === toId);

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: "#0f0f18",
          borderRadius: 12,
          border: "1px solid #1e293b",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: "0.78rem",
            color: "#94a3b8",
          }}
        >
          <Mail size={14} style={{ color: "#818cf8" }} />
          <span style={{ fontWeight: 600, color: "#e2e8f0" }}>
            {"Email Thread: " + (fromAgent?.role || fromId) + " \u2194 " + (toAgent?.role || toId)}
          </span>
          <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "#475569" }}>
            {relevantEmails.length + " messages"}
          </span>
        </div>
        <EmailChainView emails={relevantEmails} />
      </motion.div>
    );
  }

  const agent = state.spawnedAgents.find((a) => a.id === selectedNode);
  const browser = selectedNode ? state.browsers[selectedNode] : undefined;
  const thought = selectedNode ? state.thoughts[selectedNode] : undefined;
  const isPlanner = selectedNode === "planner";
  const hasBrowser = !!browser?.liveViewUrl;

  const agentEmails = state.emails.filter(
    (e) => e.agentId === selectedNode || (agent?.inboxAddress && e.to?.includes(agent.inboxAddress)),
  );

  return (
    <motion.div
      key={selectedNode}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "#0f0f18",
        borderRadius: 12,
        border: "1px solid #1e293b",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background:
              agent?.status === "completed" ? "#a78bfa" :
              agent?.status === "active" ? "#22c55e" :
              agent?.status === "failed" ? "#ef4444" : "#f59e0b",
          }}
        />
        <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "#e2e8f0" }}>
          {isPlanner ? "Orchestrator" : agent?.role || selectedNode}
        </span>
        <span
          style={{
            fontSize: "0.68rem",
            padding: "2px 8px",
            borderRadius: 10,
            background: "#1e293b",
            color: "#94a3b8",
          }}
        >
          {agent?.status || (isPlanner ? "active" : "unknown")}
        </span>
        {agent?.inboxAddress && (
          <span style={{ fontSize: "0.68rem", color: "#818cf8", fontFamily: "monospace" }}>
            {agent.inboxAddress}
          </span>
        )}
        {agent?.address && (
          <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "#475569", fontFamily: "monospace" }}>
            {agent.address.slice(0, 6) + "..." + agent.address.slice(-4)}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {hasBrowser && (
          <div style={{ borderBottom: "1px solid #1e293b" }}>
            <div
              style={{
                padding: "6px 14px",
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: "0.72rem",
                color: "#64748b",
                background: "#0c0c14",
              }}
            >
              <Monitor size={12} />
              Live Browser
              <a
                href={browser?.liveViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginLeft: "auto", color: "#818cf8", display: "flex", alignItems: "center", gap: 4 }}
              >
                <ExternalLink size={10} /> Open
              </a>
            </div>
            <iframe
              src={browser?.liveViewUrl}
              style={{ width: "100%", height: 240, border: "none", background: "#000" }}
              sandbox="allow-scripts allow-same-origin"
              title={"Browser: " + (agent?.role || "")}
            />
          </div>
        )}

        <AnimatePresence>
          {thought && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid #1e293b",
                fontSize: "0.76rem",
                color: "#94a3b8",
                background: "#0c0c14",
                fontStyle: "italic",
                maxHeight: 80,
                overflow: "hidden",
              }}
            >
              <Cpu size={10} style={{ display: "inline", marginRight: 6, verticalAlign: "middle", color: "#818cf8" }} />
              {thought.slice(0, 200)}
              {thought.length > 200 && "..."}
            </motion.div>
          )}
        </AnimatePresence>

        <EmailChainView
          emails={agentEmails}
          filterFromAgent={selectedNode || undefined}
          title={agentEmails.length > 0 ? "Agent Emails" : undefined}
        />

        {agent && (agent.fundingTxHash || agent.passportTxHash || agent.sessionTxHash) && (
          <div
            style={{
              padding: "8px 14px",
              borderTop: "1px solid #1e293b",
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              fontSize: "0.68rem",
            }}
          >
            <Wallet size={12} style={{ color: "#64748b" }} />
            {agent.fundingTxHash && (
              <a href={KITESCAN_BASE + agent.fundingTxHash} target="_blank" rel="noopener noreferrer" style={{ color: "#818cf8" }}>
                Funding TX
              </a>
            )}
            {agent.passportTxHash && (
              <a href={KITESCAN_BASE + agent.passportTxHash} target="_blank" rel="noopener noreferrer" style={{ color: "#a78bfa" }}>
                Passport TX
              </a>
            )}
            {agent.sessionTxHash && (
              <a href={KITESCAN_BASE + agent.sessionTxHash} target="_blank" rel="noopener noreferrer" style={{ color: "#22c55e" }}>
                Session TX
              </a>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
