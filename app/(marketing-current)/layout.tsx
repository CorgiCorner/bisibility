import { DocumentShell } from "@/components/layout/DocumentShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import { rootMetadata } from "@/lib/seo/jsonld";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/globals.css";

export const metadata: Metadata = rootMetadata;

export default async function PublicHomeDocumentLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const messages = await loadCoreMessages(DEFAULT_LOCALE, ["shared"]);
  return (
    <DocumentShell locale={DEFAULT_LOCALE} messages={messages} timeZone={DEFAULT_TIME_ZONE}>
      {children}
    </DocumentShell>
  );
}
