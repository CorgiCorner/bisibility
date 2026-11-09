import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { appExtensions } from "@/lib/app-extensions";
import { requireSession } from "@/lib/auth/session";
import { isCloud } from "@/lib/deployment/deployment";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export async function generateMetadata(): Promise<Metadata> {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["cloudImport"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  return createNoindexMetadata({
    title: t("cloudImport.metadata.cloudLayoutTitle"),
    description: t("cloudImport.metadata.cloudLayoutDescription"),
  });
}

type CloudLayoutProps = {
  children: ReactNode;
};

/**
 * Focused Cloud task pages omit the app sidebar; each page renders its
 * context-aware top bar.
 */
export default async function CloudLayout({ children }: Readonly<CloudLayoutProps>) {
  if (!isCloud) {
    notFound();
  }

  const session = await requireSession();
  await appExtensions.guardAccountSurface(session.user.id);
  return (
    <div className="min-h-screen bg-bg text-fg">
      <div className="mx-auto w-full max-w-[760px] px-5 pt-7 pb-24 sm:px-7">{children}</div>
    </div>
  );
}
