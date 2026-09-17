import { DocumentShell } from "@/components/layout/DocumentShell";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { rootMetadata } from "@/lib/seo/jsonld";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/app/globals.css";

export const metadata: Metadata = rootMetadata;

/** Owns the document for auth, app, onboarding, and other regional routes. */
export default async function RegionalDocumentLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const runtime = await resolveRegionalDocumentLocale();
  return (
    <DocumentShell locale={runtime.locale} messages={runtime.messages} timeZone={runtime.timeZone}>
      {children}
    </DocumentShell>
  );
}
