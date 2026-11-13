import { AgentReportDetail } from "@/components/agent-reports/AgentReportDetail";
import {
  AgentReportBack,
  AgentReportDetailFrame,
} from "@/components/agent-reports/AgentReportDetailLayout";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ReportResultCard } from "@/components/report-sharing/ReportResultCard";
import { ReportShareButton } from "@/components/report-sharing/ReportShareButton";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import {
  refreshChallengeReportAction,
  saveChallengeReportLessonsAction,
} from "@/lib/actions/challenge-report";
import {
  challengeReportCanRefresh,
  challengeReportIsDraft,
  utcDateKey,
} from "@/lib/challenge-report/period";
import { parseChallengeReportBody } from "@/lib/challenge-report/schema";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import {
  getAgentReportPage,
  getAgentWorkspacePermissions,
  getReportShareSummary,
} from "@/lib/queries/agent-workspace";
import { appPath } from "@/lib/routing/app-path";
import { notFound } from "next/navigation";

export default async function AgentReportPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ project: string; reportId: string }>;
  searchParams?: Promise<{ share?: string | string[] }>;
}>) {
  const [{ project, reportId }, runtime, query] = await Promise.all([
    params,
    resolveRegionalDocumentLocale(),
    searchParams,
  ]);
  if (!isPublicIdOfType(reportId, "agr")) notFound();
  const access = await resolveProjectAccess(project);
  const [report, permissions, share, { project: identity }, messages] = await Promise.all([
    getAgentReportPage(access.publicId, reportId),
    getAgentWorkspacePermissions(access.publicId),
    getReportShareSummary(access.publicId, reportId),
    requireReadableProject(access.publicId),
    loadCoreMessages(runtime.locale, [
      "shared",
      "agentWorkspace",
      "projectSiteAudit",
      "challengeReport",
    ]),
  ]);
  if (!report) notFound();
  const challenge =
    report.kind === "challenge_report" ? parseChallengeReportBody(report.body) : null;
  const domain = identity.domain ?? identity.name;
  const today = utcDateKey(new Date());
  const draft = Boolean(
    challenge?.success &&
      !challenge.data.journey &&
      challengeReportIsDraft(challenge.data.period.to, today),
  );
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  const knownKinds = [
    "challenge_report",
    "site_audit",
    "ai_visibility",
    "prompt_explorer",
    "prompt_research",
    "manual_analysis",
  ] as const;
  const kindLabel = knownKinds.includes(report.kind as (typeof knownKinds)[number])
    ? t(`agentWorkspace.kinds.${report.kind as (typeof knownKinds)[number]}`)
    : report.kind.replace(/_/g, " ");
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <AgentReportDetailFrame>
        <AgentReportBack
          href={appPath(access.publicId, "agent-reports")}
          label={t("agentWorkspace.back")}
        />
        <AgentReportDetail
          canEditLessons={permissions.canEdit}
          canRefresh={Boolean(
            permissions.canEdit &&
              challenge?.success &&
              challengeReportCanRefresh(
                challenge.data,
                today,
                report.provenance.baselineSnapshotId,
              ),
          )}
          draft={draft}
          draftLabel={t("agentWorkspace.draft")}
          kindLabel={
            challenge?.success && challenge.data.journey
              ? challenge.data.journey.checkIns === undefined
                ? t("challengeReport.journeyFrame", {
                    calendarDays: challenge.data.journey.calendarDays,
                    workDays: challenge.data.journey.workDays,
                  })
                : t("challengeReport.journeyFrameCheckIns", {
                    calendarDays: challenge.data.journey.calendarDays,
                    checkIns: challenge.data.journey.checkIns,
                  })
              : kindLabel
          }
          card={
            challenge?.success ? (
              <ReportResultCard
                body={challenge.data}
                cardUrl={appPath(access.publicId, "agent-reports", report.id, "card")}
                domain={domain}
                faviconDomain={identity.domain}
                title={report.title}
              />
            ) : undefined
          }
          projectId={access.publicId}
          projectRef={access.publicId}
          provenanceLabel={t("agentWorkspace.provenance")}
          refreshAction={refreshChallengeReportAction}
          report={report}
          saveLessonsAction={saveChallengeReportLessonsAction}
          savedDetailsLabel={t("projectSiteAudit.savedDetails")}
          share={
            share ? (
              <ReportShareButton
                body={challenge?.success ? challenge.data : undefined}
                canEdit={permissions.canEdit}
                domain={domain}
                faviconDomain={identity.domain}
                openCard={query?.share === "card"}
                projectId={access.publicId}
                summary={share}
                title={report.title}
              />
            ) : undefined
          }
        />
      </AgentReportDetailFrame>
    </FeatureMessagesProvider>
  );
}
