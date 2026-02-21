import clsx from "clsx";

export function PipelineStepper({
  steps,
  failedStep,
}: {
  steps: string[];
  failedStep?: number;
}) {
  return (
    <div className="panel p-4 md:p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="title-font text-xl font-semibold">10-Step Enforcement Pipeline</h2>
        <p className="mono text-xs text-text-1">policy: strict</p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {steps.map((step, index) => {
          const status =
            failedStep === undefined ? "pass" : index + 1 < failedStep ? "pass" : index + 1 === failedStep ? "fail" : "pending";
          return (
            <div
              key={step}
              className={clsx(
                "rounded-xl border p-3 text-sm",
                status === "pass" && "border-emerald-400/30 bg-emerald-400/8 text-emerald-200",
                status === "fail" && "border-rose-400/30 bg-rose-400/8 text-rose-200",
                status === "pending" && "border-line bg-bg-2/50 text-text-1"
              )}
            >
              {step}
            </div>
          );
        })}
      </div>
    </div>
  );
}
