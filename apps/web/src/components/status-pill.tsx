import clsx from "clsx";
import type { StatusTone } from "@/lib/mock-data";

const toneClass: Record<StatusTone, string> = {
  success: "border-emerald-400/30 text-emerald-300 bg-emerald-400/10",
  warning: "border-amber-400/30 text-amber-300 bg-amber-400/10",
  danger: "border-rose-400/30 text-rose-300 bg-rose-400/10",
  info: "border-sky-400/30 text-sky-300 bg-sky-400/10",
};

export function StatusPill({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
        toneClass[tone]
      )}
    >
      {label}
    </span>
  );
}
