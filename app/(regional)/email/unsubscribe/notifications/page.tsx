import { UnsubscribeButton } from "@/app/(regional)/email/unsubscribe/UnsubscribeButton";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SystemPage, SystemPrimaryAction } from "@/components/marketing/system/SystemPage";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveAnonymousDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { verifyNotificationUnsubscribeToken } from "@/lib/email/notification-unsubscribe";

export async function generateMetadata() {
  const runtime = await resolveAnonymousDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["emailPreferences"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  return { robots: { follow: false, index: false }, title: t("emailPreferences.metadata.title") };
}

export default async function NotificationUnsubscribePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string; status?: string }> }>) {
  const [params, runtime] = await Promise.all([searchParams, resolveAnonymousDocumentLocale()]);
  const messages = await loadCoreMessages(runtime.locale, ["emailPreferences"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  const token = typeof params.token === "string" ? params.token : "";
  const success = params.status === "success";
  const valid = !success && verifyNotificationUnsubscribeToken(token);
  const title = success
    ? t("emailPreferences.page.successTitle")
    : valid
      ? t("emailPreferences.page.notificationTitle")
      : t("emailPreferences.page.invalidTitle");
  const description = success
    ? t("emailPreferences.page.notificationSuccess")
    : valid
      ? t("emailPreferences.page.notificationDescription")
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
            <UnsubscribeButton token={token} stream="notification" />
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
