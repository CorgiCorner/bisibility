import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ProjectContextLoading } from "@/components/project-context/ProjectContextLayout";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { AgentReportsLoading } from "./AgentReportsLayout";

export async function AgentWorkspaceLoading({
  view = "reports",
}: Readonly<{ view?: "reports" | "context" }>) {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["shared", "agentWorkspace"]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      {view === "context" ? (
        <PageContent variant="form" aria-busy="true">
          <ProjectContextLoading />
        </PageContent>
      ) : (
        <AgentReportsLoading
          description={t("agentWorkspace.reportsDescription")}
          addReportLabel={t("agentWorkspace.addReport")}
        />
      )}
    </FeatureMessagesProvider>
  );
}
