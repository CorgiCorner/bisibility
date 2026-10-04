import { Card } from "@/components/ui/Card";
import type { AgentReportResource } from "@/lib/agent-reports/model";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { ReportBody } from "./ReportBody";
import { ReportShare } from "./ReportShare";

export function AgentReportDetail({
  report,
  projectRef,
  provenanceLabel,
}: Readonly<{
  report: AgentReportResource;
  projectRef: ProjectRef;
  provenanceLabel: string;
}>) {
  return (
    <>
      <Card>
        <h1 className="break-words text-[21px] font-semibold">{report.title}</h1>
        <p className="my-2 font-sans text-[11px] uppercase tracking-wide text-fg-muted">
          {report.kind.replace(/_/g, " ")}
        </p>
        <ReportShare path={appPath(projectRef, "agent-reports", report.id)} />
      </Card>
      <Card>
        <ReportBody value={report.body} />
      </Card>
      {Object.keys(report.provenance).length ? (
        <Card>
          <h2 className="mb-4 text-[15px] font-semibold">{provenanceLabel}</h2>
          <ReportBody value={report.provenance} />
        </Card>
      ) : null}
    </>
  );
}
