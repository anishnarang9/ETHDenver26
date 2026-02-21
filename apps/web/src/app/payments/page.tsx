import { PageHeader } from "@/components/page-header";
import { TxTable } from "@/components/tx-table";
import { paymentFunnel, transactions } from "@/lib/mock-data";

export default function PaymentsPage() {
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

      <TxTable rows={transactions} />

      <section className="grid gap-4 md:grid-cols-3">
        <button className="panel p-4 text-left text-sm hover:border-accent-cyan/50">Open Tx on Explorer</button>
        <button className="panel p-4 text-left text-sm hover:border-accent-cyan/50">Retry Verify</button>
        <button className="panel p-4 text-left text-sm hover:border-accent-cyan/50">Mark Incident</button>
      </section>
    </div>
  );
}
