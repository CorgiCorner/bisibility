import { AgentReportDetail } from "@/components/agent-reports/AgentReportDetail";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getAgentReportPage } from "@/lib/queries/agent-workspace";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function AgentReportPage({
  params,
}: Readonly<{ params: Promise<{ project: string; reportId: string }> }>) {
  const [{ project, reportId }, runtime] = await Promise.all([
    params,
    resolveRegionalDocumentLocale(),
  ]);
  if (!isPublicIdOfType(reportId, "agr")) notFound();
  const access = await resolveProjectAccess(project);
  const [report, messages] = await Promise.all([
    getAgentReportPage(access.publicId, reportId),
    loadCoreMessages(runtime.locale, ["shared", "agentWorkspace"]),
  ]);
  if (!report) notFound();
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent variant="constrained" className="grid gap-4">
        <Link
          href={appPath(access.publicId, "agent-reports")}
          className="text-[13px] font-semibold text-accent-text hover:underline"
        >
          {t("agentWorkspace.back")}
        </Link>
        <AgentReportDetail
          report={report}
          projectRef={access.publicId}
          provenanceLabel={t("agentWorkspace.provenance")}
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
