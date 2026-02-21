"use client";

import { ConsoleLayout } from "../../components/console-layout";
import { SSEProvider } from "../../lib/sse-context";

export default function ConsolePage() {
  const plannerUrl = process.env.NEXT_PUBLIC_PLANNER_URL || "http://localhost:4005";

  return (
    <SSEProvider url={`${plannerUrl}/api/events`}>
      <ConsoleLayout plannerUrl={plannerUrl} />
    </SSEProvider>
  );
}
