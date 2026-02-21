"use client";

import { useEffect, useMemo, useState } from "react";
import { getTimeline } from "../lib/api";

interface TimelineEvent {
  id: string;
  actionId: string;
  routeId: string;
  eventType: string;
  detailsJson: Record<string, unknown>;
  createdAt: string;
}

export function TimelinePanel(props: { agentAddress: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [status, setStatus] = useState("Waiting for agent address");

  useEffect(() => {
    if (!props.agentAddress) {
      return;
    }

    let active = true;
    let interval: NodeJS.Timeout;

    const pull = async () => {
      try {
        const payload = await getTimeline(props.agentAddress);
        if (active) {
          setEvents(payload.events as TimelineEvent[]);
          setStatus(`Loaded ${payload.events.length} events`);
        }
      } catch (error) {
        if (active) {
          setStatus(`Timeline fetch failed: ${(error as Error).message}`);
        }
      }
    };

    void pull();
    interval = setInterval(() => {
      void pull();
    }, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [props.agentAddress]);

  const grouped = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const event of events) {
      const list = map.get(event.actionId) || [];
      list.push(event);
      map.set(event.actionId, list);
    }
    return Array.from(map.entries());
  }, [events]);

  return (
    <div className="panel">
      <h2>Live Timeline</h2>
      <div className="status">{status}</div>
      <div className="timeline">
        {grouped.map(([actionId, actionEvents]) => (
          <div className="event" key={actionId}>
            <strong>{actionId}</strong>
            <div className="meta">{actionEvents[0]?.routeId}</div>
            {actionEvents.map((event) => (
              <div key={event.id} className="meta" style={{ marginTop: 5 }}>
                {new Date(event.createdAt).toLocaleTimeString()} | {event.eventType}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
