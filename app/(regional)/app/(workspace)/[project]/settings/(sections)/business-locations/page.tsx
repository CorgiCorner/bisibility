import { BusinessLocationsWorkspace } from "@/components/business-location-settings/BusinessLocationsWorkspace";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { readLocationListSummaryFor } from "@/lib/business-location-store/ui-read";
import { requireReadableProject } from "@/lib/queries/_auth";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function BusinessLocationsSettingsPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  const [access, runtime] = await Promise.all([
    requireReadableProject(project),
    resolveRegionalDocumentLocale(),
  ]);
  const [registry, messages, t] = await Promise.all([
    readLocationListSummaryFor(access.project.publicId, { actor: access.actor }),
    loadCoreMessages(runtime.locale, ["shared", "projectSettingsShell"]),
    getTranslations({ locale: runtime.locale, namespace: "shared.localMonitors" }),
  ]);
  return (
    <SettingsShell
      activeSection="business-locations"
      projectRef={asProjectRef(access.project.publicId)}
    >
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <div className="mb-5 text-sm">
          <Link
            className="text-accent underline-offset-4 hover:underline"
            href={appPath(
              asProjectRef(access.project.publicId),
              "settings",
              "business-locations",
              "monitors",
            )}
          >
            {t("title")}
          </Link>
        </div>
        <BusinessLocationsWorkspace
          key={access.project.publicId}
          projectId={access.project.publicId}
          initialLocations={registry.locations}
          permissions={registry.permissions}
        />
      </FeatureMessagesProvider>
    </SettingsShell>
  );
}
