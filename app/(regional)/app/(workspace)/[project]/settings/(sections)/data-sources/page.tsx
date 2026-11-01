import { DomainRatingSettings } from "@/components/domain-rating/DomainRatingSettings";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { DataSourcesSettingsContent } from "@/components/settings/data-sources/DataSourcesSettingsContent";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getDomainRating } from "@/lib/queries/domain-rating";
import { getSettings } from "@/lib/queries/settings";
import { asProjectRef } from "@/lib/routing/app-path";

type Props = { params: Promise<{ project: string }> };
export default async function DataSourcesSettingsPage({ params }: Readonly<Props>) {
  const { project: projectRef } = await params;
  const [settings, access, runtime, domainRating] = await Promise.all([
    getSettings(projectRef),
    requireReadableProject(projectRef),
    resolveRegionalDocumentLocale(),
    getDomainRating(projectRef),
  ]);
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectSettingsShell",
    "projectSettingsTracking",
  ]);
  const role = getProjectRole(access.actor, access.project.id);
  const canEdit =
    settings.project.writeMode === "active" && canProjectAction(role, "update", "project_defaults");
  return (
    <SettingsShell activeSection="data-sources" projectRef={asProjectRef(access.project.publicId)}>
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <div data-settings-section-slot="data-sources">
          <DataSourcesSettingsContent
            canEdit={canEdit}
            defaults={settings.defaults}
            projectId={settings.project.projectId}
          />
          <DomainRatingSettings
            key={access.project.publicId}
            data={domainRating}
            canEdit={
              settings.project.writeMode === "active" &&
              canProjectAction(role, "manage", "provider_connection")
            }
          />
        </div>
      </FeatureMessagesProvider>
    </SettingsShell>
  );
}
