import {
  CloudImportScreen,
  type CloudImportScreenContext,
} from "@/components/cloud/CloudImportScreen";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = createNoindexMetadata({
  title: "Instance import | bisibility",
  description:
    "Create a one-time migration token that authorizes a self-hosted instance to push its data into this hosted project.",
});

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
