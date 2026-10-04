import { PageContent } from "@/components/shell/PageContent";
import { Card } from "@/components/ui/Card";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";

export default async function Loading() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["shared", "projectSiteAudit"]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  return (
    <PageContent>
      <Card role="status" aria-busy="true">
        <p className="m-0 text-[13px] text-fg-muted">{t("projectSiteAudit.loadingPage")}</p>
      </Card>
    </PageContent>
  );
}
