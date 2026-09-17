import {
  CloudImportScreen,
  type CloudImportScreenContext,
} from "@/components/cloud/CloudImportScreen";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["cloudImport"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  return createNoindexMetadata({
    description: t("cloudImport.metadata.cloudDescription"),
    title: t("cloudImport.metadata.cloudTitle"),
  });
}

type CloudImportPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function resolveContext(value: string | string[] | undefined): CloudImportScreenContext {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "onboard" ? "cloud-onboard" : "cloud-settings";
}

export default async function CloudImportPage({ searchParams }: Readonly<CloudImportPageProps>) {
  const params = await searchParams;
  const projectRef = Array.isArray(params?.project) ? params.project[0] : params?.project;
  if (!projectRef) {
    redirect("/app");
  }
  const access = await resolveProjectAccess(projectRef);

  return <CloudImportScreen context={resolveContext(params?.ctx)} projectRef={access.publicId} />;
}
