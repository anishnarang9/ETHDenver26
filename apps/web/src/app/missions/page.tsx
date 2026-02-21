import { PageHeader } from "@/components/page-header";
import { missionRuns } from "@/lib/mock-data";

export default function MissionsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mission Runs"
        subtitle="Inspect historical runs, compare outcomes, and replay event streams for diagnostics."
        badge={{ label: "Replay Ready", tone: "info" }}
      />

      <section className="panel overflow-hidden">
        <div className="border-b border-line px-4 py-3 md:px-5">
          <p className="text-sm text-text-1">Recent runs</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.14em] text-text-1">
              <tr>
                <th className="px-4 py-3 md:px-5">Run</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Spend</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {missionRuns.map((run) => (
                <tr key={run.id} className="border-t border-line/70">
                  <td className="mono px-4 py-3 md:px-5">{run.id}</td>
                  <td className="px-4 py-3">{run.status}</td>
                  <td className="mono px-4 py-3">{run.duration}</td>
                  <td className="mono px-4 py-3">{run.spend}</td>
                  <td className="mono px-4 py-3 text-text-1">{run.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <button className="panel p-4 text-left text-sm hover:border-accent-cyan/50">Replay @ 1x</button>
        <button className="panel p-4 text-left text-sm hover:border-accent-cyan/50">Replay @ 2x</button>
        <button className="panel p-4 text-left text-sm hover:border-accent-cyan/50">Export Run JSON</button>
      </section>
    </div>
  );
}
