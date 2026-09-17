import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SystemPage, SystemPrimaryAction } from "@/components/marketing/system/SystemPage";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveAnonymousDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { verifyMarketingUnsubscribeToken } from "@/lib/email/marketing-unsubscribe";
import type { Metadata } from "next";
import { UnsubscribeButton } from "./UnsubscribeButton";

export async function generateMetadata(): Promise<Metadata> {
  const runtime = await resolveAnonymousDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["emailPreferences"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  return {
    alternates: { canonical: null },
    robots: { follow: false, index: false },
    title: t("emailPreferences.metadata.title"),
  };
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}

export default async function EmailUnsubscribePage({ searchParams }: Readonly<PageProps>) {
  const [params, runtime] = await Promise.all([searchParams, resolveAnonymousDocumentLocale()]);
  const messages = await loadCoreMessages(runtime.locale, ["emailPreferences"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  const token = value(params.token) ?? "";
  const success = value(params.status) === "success";
  const valid = !success && verifyMarketingUnsubscribeToken(token) !== null;

  const title = success
    ? t("emailPreferences.page.successTitle")
    : valid
      ? t("emailPreferences.page.validTitle")
      : t("emailPreferences.page.invalidTitle");
  const description = success
    ? t("emailPreferences.page.successDescription")
    : valid
      ? t("emailPreferences.page.validDescription")
      : t("emailPreferences.page.invalidDescription");

  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <SystemPage
        actions={
          valid ? (
            <UnsubscribeButton token={token} />
          ) : (
            <SystemPrimaryAction href="/">{t("emailPreferences.page.back")}</SystemPrimaryAction>
          )
        }
        description={description}
        docsLinkLabel={t("emailPreferences.page.docsLink")}
        kicker={t("emailPreferences.page.kicker")}
        statusLabel={t("emailPreferences.page.kicker")}
        terminal={null}
        title={title}
      />
    </FeatureMessagesProvider>
  );
}
