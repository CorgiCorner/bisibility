import { CloudImportScreen } from "@/components/cloud/CloudImportScreen";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["cloudImport"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  return createNoindexMetadata({
    description: t("cloudImport.metadata.instanceDescription"),
    title: t("cloudImport.metadata.instanceTitle"),
  });
}

type SettingsImportPageProps = {
  params: Promise<{ project: string }>;
};

export default async function SettingsImportPage({ params }: Readonly<SettingsImportPageProps>) {
  const { project } = await params;
  const access = await resolveProjectAccess(project);

  return (
    <PageContent variant="form">
      <CloudImportScreen context="app-settings" projectRef={access.publicId} />
    </PageContent>
  );
}
