import { IntegrationsPageLoading } from "@/components/integrations/IntegrationsPageLoading";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { deploymentMode } from "@/lib/deployment/deployment";
export default async function IntegrationsLoading() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["projectIntegrations"]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  return (
    <IntegrationsPageLoading
      connectionsLabel={t("projectIntegrations.tabs.connections")}
      byokLabel={t("projectIntegrations.tabs.byokUsage")}
      usageLabel={
        deploymentMode() === "cloud" ? t("projectIntegrations.tabs.creditsUsage") : undefined
      }
    />
  );
}
