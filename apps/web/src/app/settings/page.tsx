import { PageHeader } from "@/components/page-header";

const integrations = [
  { name: "OpenAI", state: "Connected" },
  { name: "Firecrawl", state: "Connected" },
  { name: "AgentMail", state: "Warning" },
  { name: "Pieverse Facilitator", state: "Connected" },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings and Integrations"
        subtitle="Configure environments, verify external services, and control feature flags."
        badge={{ label: "Staging", tone: "warning" }}
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="panel p-4 md:p-5">
          <h2 className="title-font text-xl font-semibold">Environment</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-lg border border-accent-cyan/40 bg-accent-cyan/15 px-3 py-2 text-sm text-accent-cyan">
              demo-testnet
            </button>
            <button className="rounded-lg border border-line bg-bg-2 px-3 py-2 text-sm">staging</button>
            <button className="rounded-lg border border-line bg-bg-2 px-3 py-2 text-sm">local</button>
          </div>
        </article>

        <article className="panel p-4 md:p-5">
          <h2 className="title-font text-xl font-semibold">Feature Flags</h2>
          <div className="mt-4 space-y-3 text-sm">
            <label className="flex items-center justify-between rounded-lg border border-line bg-bg-2/50 p-3">
              <span>Replay mode</span>
              <input type="checkbox" defaultChecked />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-line bg-bg-2/50 p-3">
              <span>Strict enforcement logs</span>
              <input type="checkbox" defaultChecked />
            </label>
          </div>
        </article>
      </section>

      <section className="panel p-4 md:p-5">
        <h2 className="title-font text-xl font-semibold">Service Connectivity</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {integrations.map((integration) => (
            <div key={integration.name} className="rounded-lg border border-line bg-bg-2/60 p-3">
              <p className="text-sm">{integration.name}</p>
              <p className="mono mt-1 text-xs text-text-1">{integration.state}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-lg border border-line bg-bg-2 px-3 py-2 text-sm">Validate Config</button>
          <button className="rounded-lg border border-line bg-bg-2 px-3 py-2 text-sm">Test Webhooks</button>
          <button className="rounded-lg border border-accent-cyan/40 bg-accent-cyan/15 px-3 py-2 text-sm text-accent-cyan">
            Save Changes
          </button>
        </div>
      </section>
    </div>
  );
}
