import { AgentReportDetailLoading } from "@/components/agent-reports/AgentReportDetailLoading";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";

export default async function AgentReportLoading() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["agentWorkspace"]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  return (
    <AgentReportDetailLoading
      backLabel={t("agentWorkspace.back")}
      membersOnlyLabel={t("agentWorkspace.membersOnly")}
    />
  );
}
