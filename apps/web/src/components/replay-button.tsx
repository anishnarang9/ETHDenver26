"use client";

import { useState } from "react";
import { useSSEState } from "../lib/sse-context";

export function ReplayButton({ plannerUrl }: { plannerUrl: string }) {
  const { switchUrl, dispatch } = useSSEState();
  const [isReplaying, setIsReplaying] = useState(false);

  const handleReplay = async () => {
    try {
      const res = await fetch(`${plannerUrl}/api/runs`);
      const data = await res.json() as { runs: Array<{ runId: string }> };
      if (data.runs?.length > 0) {
        const latestRunId = data.runs[0]!.runId;
        dispatch({ type: "RESET" });
        switchUrl(`${plannerUrl}/api/replay/${latestRunId}`);
        setIsReplaying(true);
      }
    } catch { /* ignore */ }
  };

  const handleLive = () => {
    dispatch({ type: "RESET" });
    switchUrl(`${plannerUrl}/api/events`);
    setIsReplaying(false);
  };

  return (
    <button
      onClick={isReplaying ? handleLive : handleReplay}
      style={{
        padding: "8px 16px", borderRadius: "8px", border: "1px solid #334155",
        background: isReplaying ? "#1e293b" : "transparent",
        color: isReplaying ? "#38bdf8" : "#94a3b8",
        fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
      }}
    >
      {isReplaying ? "← Live" : "Replay Last Run"}
    </button>
  );
}
