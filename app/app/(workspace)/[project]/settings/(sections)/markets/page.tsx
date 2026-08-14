import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { redirect } from "next/navigation";

type MarketsSettingsPageProps = { params: Promise<{ project: string }> };

export default async function MarketsSettingsPage({ params }: Readonly<MarketsSettingsPageProps>) {
  const { project: projectRef } = await params;
  redirect(appPath(asProjectRef(projectRef), "settings", "tracking"));
}
