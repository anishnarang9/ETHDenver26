import { PageHeader } from "@/components/page-header";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { enforcementSteps } from "@/lib/mock-data";

const failureGroups = [
  { step: "04 Passport", count: 3, code: "PASSPORT_REVOKED" },
  { step: "05 Scope", count: 6, code: "SCOPE_FORBIDDEN" },
  { step: "08 Budget", count: 11, code: "DAILY_BUDGET_EXCEEDED" },
];

export default function EnforcementPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Enforcement Explorer"
        subtitle="Trace the policy pipeline, inspect failures, and understand exactly which guardrail fired."
        badge={{ label: "Strict Mode", tone: "warning" }}
      />

      <PipelineStepper steps={enforcementSteps} failedStep={8} />

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <article className="panel p-4 md:p-5">
          <h2 className="title-font text-xl font-semibold">Selected Step: 08 Budget</h2>
          <p className="mt-2 text-sm text-text-1">
            Check validates per-call and daily cap against on-chain passport policy before issuing quote.
          </p>
          <div className="mt-4 space-y-2 text-sm">
            <p className="mono rounded-lg border border-line bg-bg-2/50 p-2">dailyLimit=5.0, consumed=4.9, requested=0.5</p>
            <p className="mono rounded-lg border border-line bg-bg-2/50 p-2 text-rose-300">result=reject, code=DAILY_BUDGET_EXCEEDED</p>
          </div>
        </article>

        <article className="panel p-4 md:p-5">
          <h2 className="title-font text-xl font-semibold">Failure Clusters</h2>
          <div className="mt-4 space-y-3">
            {failureGroups.map((group) => (
              <div key={group.code} className="rounded-xl border border-line bg-bg-2/50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="font-medium">{group.step}</p>
                  <p className="mono text-sm text-accent-amber">{group.count}</p>
                </div>
                <p className="mono text-xs text-text-1">{group.code}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
