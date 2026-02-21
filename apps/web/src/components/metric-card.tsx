import { TrendingDown, TrendingUp } from "lucide-react";
import type { StatusTone } from "@/lib/mock-data";
import { StatusPill } from "@/components/status-pill";

export function MetricCard({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  tone: StatusTone;
}) {
  const isUp = delta.startsWith("+");

  return (
    <article className="panel p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-text-1">{label}</p>
        <StatusPill tone={tone} label={tone} />
      </div>
      <p className="mono text-3xl font-semibold text-text-0">{value}</p>
      <div className="mt-3 flex items-center gap-2 text-xs text-text-1">
        {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        <span className="mono">{delta}</span>
        <span>vs last hour</span>
      </div>
    </article>
  );
}
