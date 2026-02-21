"use client";

import { useEffect, useMemo, useState } from "react";
import { getAction, getPassport, getTimeline } from "../lib/api";
import type { TimelineEvent } from "../lib/types";

export function TimelineWorkbench({ defaultAgent }: { defaultAgent: string }) {
  const [agent, setAgent] = useState(defaultAgent);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selectedActionId, setSelectedActionId] = useState("");
  const [output, setOutput] = useState("No action selected.");
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    if (!agent) {
      return;
    }

    let active = true;
    const poll = async () => {
      try {
        const payload = await getTimeline(agent);
        if (active) {
          setEvents(payload.events as TimelineEvent[]);
          setStatus(`Loaded ${payload.events.length} events`);
        }
      } catch (error) {
        if (active) {
          setStatus(`Timeline unavailable: ${(error as Error).message}`);
        }
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 4000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [agent]);

  const grouped = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const event of events) {
      const list = map.get(event.actionId) || [];
      list.push(event);
      map.set(event.actionId, list);
    }
    return Array.from(map.entries());
  }, [events]);

  const loadAction = async (actionId: string) => {
    setSelectedActionId(actionId);
    try {
      const data = await getAction(actionId);
      setOutput(JSON.stringify(data, null, 2));
    } catch (error) {
      setOutput(`Action lookup failed: ${(error as Error).message}`);
    }
  };

  const loadPassport = async () => {
    try {
      const data = await getPassport(agent);
      setOutput(JSON.stringify(data, null, 2));
    } catch (error) {
      setOutput(`Passport lookup failed: ${(error as Error).message}`);
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div className="panel">
        <h3 className="panel-title">Timeline Query</h3>
        <div className="field-grid" style={{ marginTop: 10 }}>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="label">Agent Address</label>
            <input className="input mono" value={agent} onChange={(event) => setAgent(event.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-2)" }}>{status}</div>
      </div>

      <div className="console-grid" style={{ marginTop: 12 }}>
        <div className="panel">
          <h3 className="panel-title">Actions</h3>
          <div className="timeline-list" style={{ marginTop: 10 }}>
            {grouped.length === 0 && <div className="event-item">No events yet for this agent.</div>}
            {grouped.map(([actionId, actionEvents]) => (
              <div key={actionId} className="event-item">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong className="mono" style={{ fontSize: 11 }}>{actionId}</strong>
                  <button className="secondary-button" onClick={() => void loadAction(actionId)}>
                    Inspect
                  </button>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-2)" }}>
                  route: {actionEvents[0]?.routeId}
                </div>
                <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                  {actionEvents.slice(0, 5).map((event) => (
                    <div key={event.id} className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>
                      {new Date(event.createdAt).toLocaleTimeString()} {event.eventType}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3 className="panel-title">Evidence Inspector</h3>
          <div className="inline-actions" style={{ marginTop: 10 }}>
            <button className="secondary-button" onClick={() => void loadAction(selectedActionId)} disabled={!selectedActionId}>
              Refresh Action
            </button>
            <button className="secondary-button" onClick={() => void loadPassport()}>
              Load Passport
            </button>
          </div>
          <textarea className="textarea mono" readOnly value={output} style={{ marginTop: 10, minHeight: 430 }} />
        </div>
      </div>
    </div>
  );
}
