import { AgentCard } from "@/components/agent-card";
import { LiveEvents, type TimelineRow } from "@/components/live-events";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { TxTable } from "@/components/tx-table";
import { agents, enforcementSteps, metricCards, missionSummary, timelineEvents, transactions } from "@/lib/mock-data";
import { getConfiguredAgentAddresses, getGatewayTimeline, getPlannerRuns, type GatewayTimelineEvent } from "@/lib/backend";

function toTimelineRows(events: GatewayTimelineEvent[]): TimelineRow[] {
  return events.slice(0, 12).map((event) => ({
    time: new Date(event.createdAt).toLocaleTimeString("en-US", { hour12: false }),
    title: event.eventType.toUpperCase(),
    detail: `action=${event.actionId.slice(0, 10)} route=${event.routeId}`,
    tone: event.eventType.toLowerCase().includes("error") ? "danger" : "info",
  }));
}

function toTransactionRows(events: GatewayTimelineEvent[]) {
  const paymentRows = events
    .filter((event) => event.eventType.toLowerCase().includes("payment"))
    .slice(0, 8)
    .map((event) => ({
      id: event.actionId.slice(0, 10),
      agent: event.agentAddress ?? "agent",
      counterparty: event.routeId,
      amount: String(event.detailsJson?.amount ?? "n/a"),
      status: event.eventType.toLowerCase().includes("verified") ? "Verified" : "Pending",
      at: new Date(event.createdAt).toISOString().replace("T", " ").slice(0, 19),
    }));

  return paymentRows.length > 0 ? paymentRows : transactions;
}

export default async function DashboardPage() {
  const runs = await getPlannerRuns();
  const configuredAgents = getConfiguredAgentAddresses();
  const primaryAgent = configuredAgents[0] ?? "";
  const gatewayEvents = primaryAgent ? await getGatewayTimeline(primaryAgent) : [];
  const initialTimeline = gatewayEvents.length ? toTimelineRows(gatewayEvents) : timelineEvents;
  const txRows = gatewayEvents.length ? toTransactionRows(gatewayEvents) : transactions;
  const dynamicMetricCards = [...metricCards];
  if (runs.length > 0) {
    dynamicMetricCards[0] = { ...dynamicMetricCards[0], value: `${runs.length}`, label: "Recorded Runs" };
    dynamicMetricCards[1] = { ...dynamicMetricCards[1], value: `${runs[0]?._count?.id ?? 0}`, label: "Events (Latest Run)" };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mission Control Dashboard"
        subtitle="Real-time operational overview across agents, enforcement checks, and settlement flow."
        badge={{ label: missionSummary.status, tone: "success" }}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dynamicMetricCards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} delta={card.delta} tone={card.tone} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <LiveEvents initialEvents={initialTimeline} />
        <div className="panel p-4 md:p-5">
          <p className="mb-3 text-xs uppercase tracking-[0.18em] text-text-1">Mission Snapshot</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-bg-2/60 p-3">
              <p className="text-xs text-text-1">Mission ID</p>
              <p className="mono mt-1 text-sm">{missionSummary.missionId}</p>
            </div>
            <div className="rounded-xl border border-line bg-bg-2/60 p-3">
              <p className="text-xs text-text-1">Health Score</p>
              <p className="mono mt-1 text-sm">{missionSummary.healthScore}</p>
            </div>
            <div className="rounded-xl border border-line bg-bg-2/60 p-3">
              <p className="text-xs text-text-1">Spend Today</p>
              <p className="mono mt-1 text-sm">{missionSummary.spendToday}</p>
            </div>
            <div className="rounded-xl border border-line bg-bg-2/60 p-3">
              <p className="text-xs text-text-1">Active Agents</p>
              <p className="mono mt-1 text-sm">{missionSummary.activeAgents}</p>
            </div>
          </div>
        </div>
      </section>

      <PipelineStepper steps={enforcementSteps} failedStep={8} />

      <section>
        <h2 className="title-font mb-3 text-2xl font-semibold">Active Agents</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.name} {...agent} />
          ))}
        </div>
      </section>

      <TxTable rows={txRows} />
    </div>
  );
}
