import { AgentReportHistory } from "@/components/agent-reports/AgentReportHistory";
import { AgentReportKindFilter } from "@/components/agent-reports/AgentReportKindFilter";
import {
  AgentReportsLayout,
  AgentReportsToolbar,
} from "@/components/agent-reports/AgentReportsLayout";
import { ChallengeReportDialog } from "@/components/challenge-report/ChallengeReportDialog";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ReportExampleThumbnail } from "@/components/report-sharing/ReportExampleThumbnail";
import { ReportShareButton } from "@/components/report-sharing/ReportShareButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { saveManualAgentReportAction } from "@/lib/actions/agent-workspace";
import { createChallengeReportAction } from "@/lib/actions/challenge-report";
import { AGENT_REPORT_LIST_KINDS, type AgentReportListKind } from "@/lib/agent-reports/kinds";
import { isDateKey, utcDateKey } from "@/lib/challenge-report/period";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getAgentReportsPage, getAgentWorkspacePermissions } from "@/lib/queries/agent-workspace";
import { appPath } from "@/lib/routing/app-path";

function selectedKind(value: string | string[] | undefined): AgentReportListKind {
  const kind = Array.isArray(value) ? value[0] : value;
  return AGENT_REPORT_LIST_KINDS.includes(kind as AgentReportListKind)
    ? (kind as AgentReportListKind)
    : "all";
}

export default async function AgentReportsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ project: string }>;
  searchParams?: Promise<{ kind?: string | string[]; compose?: string; from?: string }>;
}>) {
  const [{ project }, runtime] = await Promise.all([params, resolveRegionalDocumentLocale()]);
  const query: { kind?: string | string[]; compose?: string; from?: string } = searchParams
    ? await searchParams
    : {};
  const kind = selectedKind(query.kind);
  const access = await resolveProjectAccess(project);
  const [{ reports, canCreate, challenge, journey, workAvailable }, permissions, messages] =
    await Promise.all([
      getAgentReportsPage(
        access.publicId,
        kind === "all" ? undefined : kind,
        query.compose === "challenge",
      ),
      getAgentWorkspacePermissions(access.publicId),
      loadCoreMessages(runtime.locale, ["shared", "agentWorkspace", "challengeReport"]),
    ]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  const kindLabels = Object.fromEntries(
    AGENT_REPORT_LIST_KINDS.map((entry) => [entry, t(`agentWorkspace.kinds.${entry}`)]),
  );
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <AgentReportsLayout>
        <AgentReportsToolbar
          description={t("agentWorkspace.reportsDescription")}
          filter={
            <AgentReportKindFilter
              label={t("agentWorkspace.kindFilter")}
              labels={kindLabels}
              value={kind}
            />
          }
          action={
            canCreate ? (
              <ChallengeReportDialog
                createAction={createChallengeReportAction}
                defaultStart={
                  journey?.from ??
                  (query.from && isDateKey(query.from) ? query.from : challenge.defaultStart)
                }
                domain={challenge.domain}
                initialOpen={query.compose === "performance" || Boolean(journey)}
                journey={Boolean(journey)}
                projectId={access.publicId}
                saveAction={saveManualAgentReportAction}
                today={journey?.to ?? utcDateKey(new Date())}
                workAvailable={workAvailable}
              />
            ) : undefined
          }
        />
        {reports.length ? (
          <AgentReportHistory
            audience={(report) =>
              `${t("agentWorkspace.whoCanOpen")}: ${
                report.audience === "link"
                  ? t("agentWorkspace.audienceLink")
                  : t("agentWorkspace.audienceMembers")
              }`
            }
            draftLabel={t("agentWorkspace.draft")}
            kindLabels={kindLabels}
            locale={runtime.locale}
            projectRef={access.publicId}
            reports={reports}
            share={(report) =>
              report.share ? (
                <ReportShareButton
                  canEdit={permissions.canEdit}
                  projectId={access.publicId}
                  summary={report.share}
                  title={report.title}
                />
              ) : null
            }
            timeZone={runtime.timeZone}
          />
        ) : (
          <div className="grid gap-4">
            <EmptyState
              description={
                kind === "all"
                  ? t("agentWorkspace.emptyDescription")
                  : t("agentWorkspace.filterEmpty")
              }
              title={t("agentWorkspace.emptyTitle")}
            />
            {kind === "all" ? (
              <ReportExampleThumbnail
                exampleHref={appPath(access.publicId, "agent-reports", "example")}
                label={t("challengeReport.exampleReport")}
              />
            ) : null}
          </div>
        )}
        {reports.length === 100 ? (
          <p className="text-ui-caption text-fg-muted">{t("agentWorkspace.historyLimit")}</p>
        ) : null}
      </AgentReportsLayout>
    </FeatureMessagesProvider>
  );
}
