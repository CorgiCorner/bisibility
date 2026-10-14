import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { MonitorDetail } from "@/components/local-monitors/MonitorDetail";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { readLocalResultsPage } from "@/lib/local-monitor-results/page-read";
import { readLocalMonitor } from "@/lib/local-monitor-store/read";
import { LocalMeasurementUnavailableError } from "@/lib/local-monitoring-store/errors";
import { readMonitorSetupChoices } from "@/lib/local-monitors/setup-read";
import { requireReadableProject } from "@/lib/queries/_auth";
import { asProjectRef } from "@/lib/routing/app-path";
import { notFound } from "next/navigation";

export default async function LocalMonitorPage({
  params,
  searchParams,
}: {
  params: Promise<{ project: string; monitor: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { project, monitor } = await params;
  const [access, runtime] = await Promise.all([
    requireReadableProject(project),
    resolveRegionalDocumentLocale(),
  ]);
  const context = { actor: access.actor };
  const projectId = access.project.publicId;
  const [value, choices, messages] = await Promise.all([
    readLocalMonitor({ projectId, monitorId: monitor }, context).catch((error: unknown) => {
      if (error instanceof LocalMeasurementUnavailableError) notFound();
      throw error;
    }),
    readMonitorSetupChoices({ projectId }, context),
    loadCoreMessages(runtime.locale, ["shared", "projectSettingsShell"]),
  ]);
  const resultPage = await readLocalResultsPage(projectId, monitor, await searchParams, context);
  return (
    <SettingsShell activeSection="business-locations" projectRef={asProjectRef(projectId)}>
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <MonitorDetail
          key={monitor}
          projectId={projectId}
          monitor={value}
          choices={choices}
          {...resultPage}
        />
      </FeatureMessagesProvider>
    </SettingsShell>
  );
}
