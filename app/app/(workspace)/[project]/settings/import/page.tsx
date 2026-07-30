import { CloudImportScreen } from "@/components/cloud/CloudImportScreen";
import { PageContent } from "@/components/shell/PageContent";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { createNoindexMetadata } from "@/lib/seo/noindex";
import type { Metadata } from "next";

export const metadata: Metadata = createNoindexMetadata({
  title: "Import from another instance | Bisibility",
  description:
    "Create a one-time migration token that authorizes another Bisibility instance to push its data into this workspace.",
});

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
