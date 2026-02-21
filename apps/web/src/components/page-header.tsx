import { StatusPill } from "@/components/status-pill";
import type { StatusTone } from "@/lib/mock-data";

export function PageHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge?: { label: string; tone: StatusTone };
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 text-xs uppercase tracking-[0.2em] text-text-1">TripDesk v2</p>
        <h1 className="title-font text-3xl font-semibold tracking-tight text-text-0 md:text-4xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-text-1 md:text-base">{subtitle}</p>
      </div>
      {badge ? <StatusPill tone={badge.tone} label={badge.label} /> : null}
    </header>
  );
}
