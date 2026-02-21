"use client";

import { ConsoleLayout } from "../../components/console-layout";

export default function ConsolePage() {
  const plannerUrl = process.env.NEXT_PUBLIC_PLANNER_URL || "http://localhost:4005";

  return <ConsoleLayout plannerUrl={plannerUrl} />;
}
