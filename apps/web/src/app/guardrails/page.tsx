import { GuardrailsPanel } from "../../components/guardrails-panel";
import { PageHeader } from "../../components/page-header";

export default function GuardrailsPage() {
  return (
    <>
      <PageHeader
        title="Guardrails Control"
        subtitle="Edit passport policy, grant sessions, and execute emergency revocation from your browser wallet."
      />
      <GuardrailsPanel />
    </>
  );
}
