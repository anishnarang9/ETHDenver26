import { SetupWizard } from "../../components/setup-wizard";
import Link from "next/link";
import { SetupShowcase } from "../../components/setup-showcase";

export default function SetupPage() {
  return (
    <div className="setup-layout">
      <div className="setup-flow-root">
        <div className="setup-top-actions">
          <Link href="/" className="secondary-button">Back to Home</Link>
        </div>
        <div className="setup-flow-header">
          <p className="setup-flow-kicker mono">Step 2 of 3</p>
          <h1 className="setup-flow-title">Guided Setup</h1>
          <p className="setup-flow-copy">
            Provision wallet authority, fund agent wallets, write passport/session guardrails, then verify operational readiness.
          </p>
        </div>
        <SetupWizard />
      </div>
      <SetupShowcase />
    </div>
  );
}
