"use client";

import { useState } from "react";
import { useSSEState } from "../lib/sse-context";

export function ReplayButton({ plannerUrl }: { plannerUrl: string }) {
  const [isReplaying, setIsReplaying] = useState(false);
  const { switchUrl, dispatch } = useSSEState();

  const replay = async () => {
    const response = await fetch(`${plannerUrl}/api/runs`);
    const data = (await response.json()) as { runs?: Array<{ runId: string }> };
    const latest = data.runs?.[0]?.runId;
    if (!latest) {
      return;
    }
    dispatch({ type: "RESET" });
    switchUrl(`${plannerUrl}/api/replay/${latest}`);
    setIsReplaying(true);
  };

  const live = () => {
    dispatch({ type: "RESET" });
    switchUrl(`${plannerUrl}/api/events`);
    setIsReplaying(false);
  };

  return (
    <button className="secondary-button" onClick={isReplaying ? live : replay}>
      {isReplaying ? "Back to Live" : "Replay Latest Run"}
    </button>
  );
}
