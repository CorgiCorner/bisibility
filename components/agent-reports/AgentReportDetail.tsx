import { SiteAuditResults } from "@/components/site-audit/SiteAuditResults";
import { Card } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";
import type { AgentReportResource } from "@/lib/agent-reports/model";
import { savedAuditPages } from "@/lib/agent-reports/saved-audit-pages";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { siteAuditResultSchema } from "@/lib/site-audit/schema";
import { AgentReportHeader } from "./AgentReportDetailLayout";
import { ReportBody } from "./ReportBody";
import { ReportShare } from "./ReportShare";
import { SavedAuditPages } from "./SavedAuditPages";

export function AgentReportDetail({
  report,
  projectRef,
  provenanceLabel,
  savedDetailsLabel,
}: Readonly<{
  report: AgentReportResource;
  projectRef: ProjectRef;
  provenanceLabel: string;
  savedDetailsLabel: string;
}>) {
  const audit = report.kind === "site_audit" ? siteAuditResultSchema.safeParse(report.body) : null;
  const legacyPages =
    report.kind === "site_audit" && !audit?.success ? savedAuditPages(report.body) : [];
  return (
    <>
      <AgentReportHeader
        title={report.title}
        kind={report.kind.replace(/_/g, " ")}
        share={<ReportShare path={appPath(projectRef, "agent-reports", report.id)} />}
      />
      {audit?.success ? (
        <SiteAuditResults result={audit.data} />
      ) : legacyPages.length ? (
        <>
          <SavedAuditPages pages={legacyPages} />
          <Disclosure
            title={savedDetailsLabel}
            headingLevel="h2"
            summaryClassName="px-4 py-3 sm:px-4 [&>h2]:text-[13px]"
            contentClassName="px-4 pb-4 sm:px-4"
          >
            <ReportBody value={report.body} />
          </Disclosure>
        </>
      ) : (
        <Card>
          <ReportBody value={report.body} />
        </Card>
      )}
      {Object.keys(report.provenance).length ? (
        <Disclosure
          title={provenanceLabel}
          headingLevel="h2"
          summaryClassName="px-4 py-3 sm:px-4 [&>h2]:text-[13px]"
          contentClassName="px-4 pb-4 sm:px-4"
        >
          <ReportBody value={report.provenance} />
        </Disclosure>
      ) : null}
    </>
  );
}
