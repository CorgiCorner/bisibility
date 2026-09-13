import { requireReadableProject } from "@/lib/queries/_auth";
import { appPath } from "@/lib/routing/app-path";
import { redirect } from "next/navigation";

export default async function UsageSettingsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ project: string }>;
  searchParams?: Promise<{ budget?: string }>;
}>) {
  const { project } = await params;
  const access = await requireReadableProject(project);
  const query = await searchParams;
  return redirect(
    `${appPath(access.project.publicId, "integrations")}?tab=usage${query?.budget === "edit" ? "&budget=edit" : ""}`,
  );
}
