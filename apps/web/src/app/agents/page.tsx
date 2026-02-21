import { AgentCard } from "@/components/agent-card";
import { PageHeader } from "@/components/page-header";
import { agents } from "@/lib/mock-data";
import { getConfiguredAgentAddresses, getPassport } from "@/lib/backend";

const sessionRows = [
  { key: "0x3A..8f", agent: "planner", expires: "2026-02-21 18:30", state: "active" },
  { key: "0x9D..1a", agent: "rider", expires: "2026-02-21 17:00", state: "active" },
  { key: "0x00..ff", agent: "foodie", expires: "2026-02-21 13:58", state: "revoked" },
];

export default async function AgentsPage() {
  const addresses = getConfiguredAgentAddresses();
  const passportResults = await Promise.all(addresses.slice(0, 5).map((address) => getPassport(address)));

  const liveAgents = passportResults
    .map((passport, index) => {
      const address = addresses[index];
      if (!passport) return null;
      const revoked = passport.latestSnapshot?.revoked ?? passport.onchain?.revoked ?? false;
      return {
        name: `Agent ${address.slice(0, 6)}`,
        role: "On-chain Policy Subject",
        state: revoked ? "Revoked" : "Healthy",
        balance: "n/a",
        scopes: Array.isArray(passport.latestSnapshot?.scopes)
          ? (passport.latestSnapshot?.scopes as string[])
          : Array.isArray(passport.onchain?.scopes)
            ? (passport.onchain.scopes as string[])
            : [],
      };
    })
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));

  const displayAgents = liveAgents.length > 0 ? liveAgents : agents;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agent Registry"
        subtitle="Track passport policy, wallet state, and session delegation for each autonomous agent."
        badge={{ label: "5 Agents", tone: "info" }}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {displayAgents.map((agent) => (
          <AgentCard key={agent.name} {...agent} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="panel p-4 md:p-5">
          <h2 className="title-font text-xl font-semibold">Passport Controls</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-sm text-rose-300">Revoke Passport</button>
            <button className="rounded-lg border border-line bg-bg-2 px-3 py-2 text-sm">Rotate Session Key</button>
            <button className="rounded-lg border border-line bg-bg-2 px-3 py-2 text-sm">View Call History</button>
          </div>
        </article>

        <article className="panel overflow-hidden">
          <div className="border-b border-line px-4 py-3 md:px-5">
            <h2 className="title-font text-xl font-semibold">Session Keys</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-text-1">
                <tr>
                  <th className="px-4 py-3 md:px-5">Key</th>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">State</th>
                </tr>
              </thead>
              <tbody>
                {sessionRows.map((row) => (
                  <tr key={row.key} className="border-t border-line/70">
                    <td className="mono px-4 py-3 md:px-5">{row.key}</td>
                    <td className="px-4 py-3">{row.agent}</td>
                    <td className="mono px-4 py-3">{row.expires}</td>
                    <td className="px-4 py-3">{row.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
