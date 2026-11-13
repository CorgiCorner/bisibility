import {
  ChallengeReportRefreshButton,
  ChallengeReportScreen,
} from "@/components/challenge-report/ChallengeReportScreen";
import { SiteAuditResults } from "@/components/site-audit/SiteAuditResults";
import { Card } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";
import type { AgentReportResource } from "@/lib/agent-reports/model";
import { savedAuditPages } from "@/lib/agent-reports/saved-audit-pages";
import { parseChallengeReportBody } from "@/lib/challenge-report/schema";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import { siteAuditResultSchema } from "@/lib/site-audit/schema";
import type { ReactNode } from "react";
import { AgentReportHeader } from "./AgentReportDetailLayout";
import { ReportBody } from "./ReportBody";
import { ReportShare } from "./ReportShare";
import { SavedAuditPages } from "./SavedAuditPages";

type ReportAction = (input: unknown) => Promise<{ ok: true } | { ok: false }>;

export function AgentReportDetail({
  canEditLessons = false,
  canRefresh = false,
  draft = false,
  draftLabel,
  card,
  kindLabel,
  projectId,
  provenanceLabel,
  refreshAction,
  report,
  projectRef,
  saveLessonsAction,
  savedDetailsLabel,
  share,
}: Readonly<{
  canEditLessons?: boolean;
  canRefresh?: boolean;
  draft?: boolean;
  draftLabel?: string;
  card?: ReactNode;
  kindLabel?: string;
  projectId?: string;
  report: AgentReportResource;
  projectRef: ProjectRef;
  provenanceLabel: string;
  refreshAction?: ReportAction;
  saveLessonsAction?: ReportAction;
  savedDetailsLabel: string;
  share?: ReactNode;
}>) {
  const audit = report.kind === "site_audit" ? siteAuditResultSchema.safeParse(report.body) : null;
  const challenge =
    report.kind === "challenge_report" ? parseChallengeReportBody(report.body) : null;
  const legacyPages =
    report.kind === "site_audit" && !audit?.success ? savedAuditPages(report.body) : [];
  const kindText = kindLabel ?? report.kind.replace(/_/g, " ");
  return (
    <>
      <AgentReportHeader
        title={report.title}
        kind={draft && draftLabel ? `${kindText} · ${draftLabel}` : kindText}
        share={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {challenge?.success && canRefresh && refreshAction ? (
              <ChallengeReportRefreshButton
                projectId={projectId ?? projectRef}
                refreshAction={refreshAction}
                reportId={report.id}
              />
            ) : null}
            {share ?? <ReportShare path={appPath(projectRef, "agent-reports", report.id)} />}
          </div>
        }
      />
      {card}
      {challenge?.success ? (
        <ChallengeReportScreen
          body={challenge.data}
          canEditLessons={canEditLessons}
          projectId={projectId ?? projectRef}
          reportId={report.id}
          saveLessonsAction={saveLessonsAction}
        />
      ) : audit?.success ? (
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
      {!challenge?.success && Object.keys(report.provenance).length ? (
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
