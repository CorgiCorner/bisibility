import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";

export default async function PublicReportNotFound() {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["shared", "challengeReport"]);
  const t = createIntlTranslator(runtime.locale, messages, runtime);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <main className="mx-auto grid w-full min-w-0 max-w-3xl gap-2 px-4 py-16">
        <h1 className="m-0 text-ui-section">{t("challengeReport.share.notFoundTitle")}</h1>
        <p className="m-0 text-ui-body text-fg-muted">{t("challengeReport.share.notFoundBody")}</p>
      </main>
    </FeatureMessagesProvider>
  );
}
