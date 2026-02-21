import clsx from "clsx";

function tone(state: string) {
  if (state === "Healthy") return "text-emerald-300 border-emerald-400/30 bg-emerald-400/10";
  if (state === "Warning") return "text-amber-300 border-amber-400/30 bg-amber-400/10";
  return "text-rose-300 border-rose-400/30 bg-rose-400/10";
}

export function AgentCard({
  name,
  role,
  state,
  balance,
  scopes,
}: {
  name: string;
  role: string;
  state: string;
  balance: string;
  scopes: string[];
}) {
  return (
    <article className="panel p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="title-font text-xl font-semibold">{name}</h3>
          <p className="text-sm text-text-1">{role}</p>
        </div>
        <span className={clsx("rounded-full border px-2.5 py-1 text-xs font-semibold", tone(state))}>{state}</span>
      </div>
      <p className="mono mb-3 text-lg">{balance}</p>
      <div className="flex flex-wrap gap-2">
        {scopes.map((scope) => (
          <span key={scope} className="rounded-full border border-line bg-bg-2/70 px-2.5 py-1 text-xs text-text-1">
            {scope}
          </span>
        ))}
      </div>
    </article>
  );
}
