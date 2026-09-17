import { DocumentShell } from "@/components/layout/DocumentShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { DEFAULT_TIME_ZONE } from "@/i18n/formats";
import { rootMetadata } from "@/lib/seo/jsonld";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/globals.css";

export const metadata: Metadata = rootMetadata;

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: Readonly<RootLayoutProps>) {
  const messages = await loadCoreMessages(DEFAULT_LOCALE, ["shared"]);
  return (
    <DocumentShell locale={DEFAULT_LOCALE} messages={messages} timeZone={DEFAULT_TIME_ZONE}>
      {children}
    </DocumentShell>
  );
}
