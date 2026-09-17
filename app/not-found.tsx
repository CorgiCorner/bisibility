import { EmergencyRecovery } from "@/components/i18n/EmergencyRecovery";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { EmergencyMessagesProvider } from "@/i18n/EmergencyMessagesProvider";
import { resolvePathLocale } from "@/i18n/path-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import type { Metadata } from "next";

async function notFoundLocale() {
  return (await resolvePathLocale()) ?? (await resolveRegionalDocumentLocale()).locale;
}

export async function generateMetadata(): Promise<Metadata> {
  const runtime = await resolveRegionalDocumentLocale();
  const locale = (await resolvePathLocale()) ?? runtime.locale;
  const messages = await loadCoreMessages(locale, ["shared"]);
  const t = createIntlTranslator(locale, messages, { timeZone: runtime.timeZone });
  return {
    alternates: { canonical: null },
    robots: { follow: false, index: false },
    title: t("shared.emergencyRecovery.notFound.title"),
  };
}

// Rendered per-request so the secondary action reflects the runtime deployment mode:
// the self-host build has no homepage - its root only redirects to the sign-in page.
export const dynamic = "force-dynamic";

export default async function NotFound() {
  // A dead URL carrying an active locale prefix is served in that locale even with no cookie.
  const locale = await notFoundLocale();
  return (
    <EmergencyMessagesProvider initialLocale={locale}>
      <EmergencyRecovery kind="notFound" />
    </EmergencyMessagesProvider>
  );
}
