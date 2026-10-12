import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ProjectContextLoading } from "@/components/project-context/ProjectContextLayout";
import { SettingsRouteLoading } from "@/components/settings/shell/SettingsRouteLoading";
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
        <SettingsRouteLoading activeSection="context" withSearch>
          <ProjectContextLoading />
        </SettingsRouteLoading>
      ) : (
        <AgentReportsLoading
          description={t("agentWorkspace.reportsDescription")}
          addReportLabel={t("agentWorkspace.addReport")}
        />
      )}
    </FeatureMessagesProvider>
  );
}
