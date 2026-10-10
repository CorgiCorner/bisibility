import { AgentReportHistory } from "@/components/agent-reports/AgentReportHistory";
import {
  AgentReportsLayout,
  AgentReportsToolbar,
} from "@/components/agent-reports/AgentReportsLayout";
import { ReportComposer } from "@/components/agent-reports/ReportComposer";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { EmptyState } from "@/components/ui/EmptyState";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { saveManualAgentReportAction } from "@/lib/actions/agent-workspace";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getAgentReportsPage } from "@/lib/queries/agent-workspace";

export default async function AgentReportsPage({
  params,
}: Readonly<{ params: Promise<{ project: string }> }>) {
  const [{ project }, runtime] = await Promise.all([params, resolveRegionalDocumentLocale()]);
  const access = await resolveProjectAccess(project);
  const [{ reports, canCreate }, messages] = await Promise.all([
    getAgentReportsPage(access.publicId),
    loadCoreMessages(runtime.locale, ["shared", "agentWorkspace"]),
  ]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <AgentReportsLayout>
        <AgentReportsToolbar
          description={t("agentWorkspace.reportsDescription")}
          action={
            canCreate ? (
              <ReportComposer
                projectId={access.publicId}
                saveAction={saveManualAgentReportAction}
              />
            ) : undefined
          }
        />
        {reports.length ? (
          <AgentReportHistory
            reports={reports}
            projectRef={access.publicId}
            locale={runtime.locale}
            timeZone={runtime.timeZone}
          />
        ) : (
          <EmptyState
            title={t("agentWorkspace.emptyTitle")}
            description={t("agentWorkspace.emptyDescription")}
          />
        )}
        {reports.length === 100 ? (
          <p className="text-[12px] text-fg-muted">{t("agentWorkspace.historyLimit")}</p>
        ) : null}
      </AgentReportsLayout>
    </FeatureMessagesProvider>
  );
}
