"use client";

import { useEffect, useMemo, useState } from "react";
import { EventTimeline } from "@/components/event-timeline";
import { plannerBaseUrl, type PlannerStreamEvent } from "@/lib/backend";
import type { StatusTone } from "@/lib/mock-data";

export type TimelineRow = {
  time: string;
  title: string;
  detail: string;
  tone: StatusTone;
};

function toneFromEventType(type: string): StatusTone {
  const normalized = type.toLowerCase();
  if (normalized.includes("error") || normalized.includes("failed")) return "danger";
  if (normalized.includes("warning")) return "warning";
  if (normalized.includes("complete") || normalized.includes("verified") || normalized.includes("sent")) return "success";
  return "info";
}

function toTimelineRow(event: PlannerStreamEvent): TimelineRow {
  const now = new Date();
  const title = event.type.replaceAll("_", " ").toUpperCase();
  const detail =
    typeof event.payload?.text === "string"
      ? event.payload.text
      : JSON.stringify(event.payload ?? {}).slice(0, 140) || "Event received";

  return {
    time: now.toLocaleTimeString("en-US", { hour12: false }),
    title,
    detail,
    tone: toneFromEventType(event.type),
  };
}

export function LiveEvents({ initialEvents }: { initialEvents: TimelineRow[] }) {
  const [events, setEvents] = useState<TimelineRow[]>(initialEvents);

  useEffect(() => {
    const source = new EventSource(`${plannerBaseUrl}/api/events`);
    source.onmessage = (message) => {
      try {
        const parsed = JSON.parse(message.data) as PlannerStreamEvent;
        const next = toTimelineRow(parsed);
        setEvents((current) => [next, ...current].slice(0, 20));
      } catch {
        // ignore malformed event payloads
      }
    };
    return () => source.close();
  }, []);

  const visibleEvents = useMemo(() => events.slice(0, 12), [events]);
  return <EventTimeline events={visibleEvents} />;
}
