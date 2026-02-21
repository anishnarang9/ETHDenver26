import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";

const colorTokens = [
  { name: "--bg-0", hex: "#0A0F14" },
  { name: "--bg-1", hex: "#101822" },
  { name: "--bg-2", hex: "#152232" },
  { name: "--accent-cyan", hex: "#33D1FF" },
  { name: "--accent-lime", hex: "#8BFF61" },
  { name: "--accent-amber", hex: "#FFB020" },
  { name: "--accent-red", hex: "#FF5D6C" },
  { name: "--accent-blue", hex: "#5E8BFF" },
];

export default function StyleguidePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Styleguide"
        subtitle="Design tokens and component states for consistent frontend iteration."
        badge={{ label: "Internal", tone: "info" }}
      />

      <section className="panel p-4 md:p-5">
        <h2 className="title-font text-xl font-semibold">Color Tokens</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {colorTokens.map((token) => (
            <div key={token.name} className="rounded-lg border border-line bg-bg-2/50 p-3">
              <div className="mb-2 h-12 rounded" style={{ background: token.hex }} />
              <p className="mono text-xs">{token.name}</p>
              <p className="mono text-xs text-text-1">{token.hex}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="panel p-4 md:p-5">
          <h2 className="title-font text-xl font-semibold">Status Pills</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusPill tone="success" label="success" />
            <StatusPill tone="warning" label="warning" />
            <StatusPill tone="danger" label="danger" />
            <StatusPill tone="info" label="info" />
          </div>
        </article>

        <article className="panel p-4 md:p-5">
          <h2 className="title-font text-xl font-semibold">Type Samples</h2>
          <p className="title-font mt-4 text-2xl">Space Grotesk Display</p>
          <p className="mt-2 text-sm">IBM Plex Sans Body</p>
          <p className="mono mt-2 text-sm">JetBrains Mono Telemetry 0x9a..33</p>
        </article>
      </section>
    </div>
  );
}
