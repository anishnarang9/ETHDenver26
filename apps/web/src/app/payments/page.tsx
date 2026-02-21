import { PageHeader } from "@/components/page-header";
import { TxTable } from "@/components/tx-table";
import { paymentFunnel, transactions } from "@/lib/mock-data";
import { getConfiguredAgentAddresses, getGatewayTimeline } from "@/lib/backend";

export default async function PaymentsPage() {
  const addresses = getConfiguredAgentAddresses();
  const timeline = addresses[0] ? await getGatewayTimeline(addresses[0]) : [];
  const liveTransactions =
    timeline.length > 0
      ? timeline
          .filter((event) => event.eventType.toLowerCase().includes("payment"))
          .slice(0, 12)
          .map((event) => ({
            id: event.actionId.slice(0, 10),
            agent: event.agentAddress.slice(0, 10),
            counterparty: event.routeId,
            amount: String(event.detailsJson?.amount ?? "n/a"),
            status: event.eventType.toLowerCase().includes("verified") ? "Verified" : "Pending",
            at: new Date(event.createdAt).toISOString().replace("T", " ").slice(0, 19),
          }))
      : transactions;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payment Operations"
        subtitle="Observe x402 flow from challenge to verification and handle unresolved settlements."
        badge={{ label: "x402 Live", tone: "success" }}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {paymentFunnel.map((stage) => (
          <article key={stage.label} className="panel p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-text-1">{stage.label}</p>
            <p className="mono mt-2 text-3xl font-semibold">{stage.value}</p>
          </article>
        ))}
      </section>

      <TxTable rows={liveTransactions} />

      <section className="grid gap-4 md:grid-cols-3">
        <button className="panel p-4 text-left text-sm hover:border-accent-cyan/50">Open Tx on Explorer</button>
        <button className="panel p-4 text-left text-sm hover:border-accent-cyan/50">Retry Verify</button>
        <button className="panel p-4 text-left text-sm hover:border-accent-cyan/50">Mark Incident</button>
      </section>
    </div>
  );
}
