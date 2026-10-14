import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { MonitorWorkspace } from "@/components/local-monitors/MonitorWorkspace";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { listLocalMonitors } from "@/lib/local-monitor-store/read";
import { readMonitorSetupChoices } from "@/lib/local-monitors/setup-read";
import { requireReadableProject } from "@/lib/queries/_auth";
import { asProjectRef } from "@/lib/routing/app-path";

export default async function LocalMonitorsPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project } = await params;
  const [access, runtime] = await Promise.all([
    requireReadableProject(project),
    resolveRegionalDocumentLocale(),
  ]);
  const context = { actor: access.actor };
  const projectId = access.project.publicId;
  const [initialPage, choices, messages] = await Promise.all([
    listLocalMonitors(projectId, context),
    readMonitorSetupChoices({ projectId }, context),
    loadCoreMessages(runtime.locale, ["shared", "projectSettingsShell"]),
  ]);
  return (
    <SettingsShell activeSection="business-locations" projectRef={asProjectRef(projectId)}>
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <MonitorWorkspace
          key={projectId}
          projectId={projectId}
          initialPage={initialPage}
          choices={choices}
        />
      </FeatureMessagesProvider>
    </SettingsShell>
  );
}
