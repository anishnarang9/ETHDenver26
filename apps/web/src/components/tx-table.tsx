import clsx from "clsx";

function statusClass(status: string) {
  if (status === "Verified") return "text-emerald-300 border-emerald-400/35 bg-emerald-400/10";
  if (status === "Pending") return "text-amber-300 border-amber-400/35 bg-amber-400/10";
  return "text-rose-300 border-rose-400/35 bg-rose-400/10";
}

export function TxTable({
  rows,
}: {
  rows: Array<{
    id: string;
    agent: string;
    counterparty: string;
    amount: string;
    status: string;
    at: string;
  }>;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-line px-4 py-3 md:px-5">
        <h2 className="title-font text-xl font-semibold">Recent Settlements</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.14em] text-text-1">
            <tr>
              <th className="px-4 py-3 md:px-5">Tx</th>
              <th className="px-4 py-3">Agent</th>
              <th className="px-4 py-3">Counterparty</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-line/70">
                <td className="mono px-4 py-3 md:px-5">{row.id}</td>
                <td className="px-4 py-3">{row.agent}</td>
                <td className="px-4 py-3">{row.counterparty}</td>
                <td className="mono px-4 py-3">{row.amount}</td>
                <td className="px-4 py-3">
                  <span className={clsx("rounded-full border px-2 py-1 text-xs font-semibold", statusClass(row.status))}>
                    {row.status}
                  </span>
                </td>
                <td className="mono px-4 py-3 text-text-1">{row.at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
