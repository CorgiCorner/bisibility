import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { redirectToSetupIfFirstRun } from "@/lib/auth/first-run";
import { createLoginMetadata } from "@/lib/seo/jsonld";
import type { Metadata } from "next";
import type { ReactNode } from "react";

/** The tab title and share preview follow the locale the sign-in page itself renders in. */
export async function generateMetadata(): Promise<Metadata> {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["auth"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  return createLoginMetadata({
    description: t("auth.login.metadata.description"),
    socialDescription: t("auth.login.metadata.socialDescription"),
    socialTitle: t("auth.login.metadata.socialTitle"),
    title: t("auth.login.metadata.title"),
  });
}

type LoginLayoutProps = {
  children: ReactNode;
};

export default async function LoginLayout({ children }: LoginLayoutProps) {
  await redirectToSetupIfFirstRun();
  return children;
}
