import { PageHeader } from "../../components/page-header";
import { TimelineWorkbench } from "../../components/timeline-workbench";

export default function TimelinePage() {
  return (
    <>
      <PageHeader
        title="Timeline and Evidence"
        subtitle="Inspect gateway event history by action, drill into enforcement traces, and fetch full action/passport payloads."
      />
      <TimelineWorkbench />
    </>
  );
}
