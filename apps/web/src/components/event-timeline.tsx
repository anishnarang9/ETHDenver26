"use client";

import { motion } from "framer-motion";
import type { StatusTone } from "@/lib/mock-data";
import { StatusPill } from "@/components/status-pill";

const toneMap: Record<StatusTone, string> = {
  success: "bg-emerald-300",
  warning: "bg-amber-300",
  danger: "bg-rose-300",
  info: "bg-sky-300",
};

export function EventTimeline({
  events,
}: {
  events: Array<{ time: string; title: string; detail: string; tone: StatusTone }>;
}) {
  return (
    <div className="panel p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="title-font text-xl font-semibold">Live Timeline</h2>
        <p className="mono text-xs text-text-1">stream: live</p>
      </div>
      <div className="space-y-3">
        {events.map((event, index) => (
          <motion.article
            key={`${event.time}-${event.title}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.06 }}
            className="rounded-xl border border-line/80 bg-bg-2/45 p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${toneMap[event.tone]}`} />
                <p className="mono text-xs text-text-1">{event.time}</p>
              </div>
              <StatusPill tone={event.tone} label={event.title} />
            </div>
            <p className="text-sm text-text-0">{event.detail}</p>
          </motion.article>
        ))}
      </div>
    </div>
  );
}
