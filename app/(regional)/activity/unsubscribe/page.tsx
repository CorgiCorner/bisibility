import { UnsubscribeAchievement } from "@/components/achievements/UnsubscribeAchievement";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
export const metadata = {
  robots: { index: false, follow: false },
  title: "Email preferences · bisibility",
};
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale, timeZone } = await resolveRegionalDocumentLocale(),
    messages = await loadCoreMessages(locale, ["shared", "account"]);
  const { token } = await searchParams;
  return (
    <FeatureMessagesProvider locale={locale} messages={messages} timeZone={timeZone}>
      <main className="mx-auto max-w-lg px-5 py-12">
        <UnsubscribeAchievement
          token={typeof token === "string" && token.length <= 1000 ? token : ""}
        />
      </main>
    </FeatureMessagesProvider>
  );
}
