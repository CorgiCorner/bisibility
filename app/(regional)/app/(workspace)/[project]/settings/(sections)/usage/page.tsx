import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { renderAccountUsageExtension } from "@/components/settings/usage/account-extension";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { requireReadableProject } from "@/lib/queries/_auth";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { redirect } from "next/navigation";

export default async function UsageSettingsPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ project: string }>;
  searchParams?: Promise<{ budget?: string }>;
}>) {
  const { project } = await params;
  const [access, runtime] = await Promise.all([
    requireReadableProject(project),
    resolveRegionalDocumentLocale(),
  ]);
  const content = await renderAccountUsageExtension({
    projectRef: access.project.publicId,
    locale: runtime.locale,
  });
  if (!content) {
    const query = await searchParams;
    return redirect(
      `${appPath(access.project.publicId, "usage")}${query?.budget === "edit" ? "?budget=edit" : ""}`,
    );
  }
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectSettingsShell",
    "projectSettingsUsage",
  ]);
  return (
    <SettingsShell activeSection="usage" projectRef={asProjectRef(access.project.publicId)}>
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        {content}
      </FeatureMessagesProvider>
    </SettingsShell>
  );
}
