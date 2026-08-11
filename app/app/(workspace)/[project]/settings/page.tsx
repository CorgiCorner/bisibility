import { settingsSectionHref } from "@/components/settings/shell/settings-sections";
import { redirect } from "next/navigation";

type SettingsRedirectProps = {
  params: Promise<{ project: string }>;
};

export default async function SettingsRedirect({ params }: Readonly<SettingsRedirectProps>) {
  const { project } = await params;
  redirect(settingsSectionHref(project, "general"));
}
