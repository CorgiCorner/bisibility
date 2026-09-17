import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ProviderUsageCard } from "@/components/settings/usage/ProviderUsageCard";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { updateProviderConnectionAllocationAction } from "@/lib/actions/provider-allocation";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { getResolvedDateFormat } from "@/lib/dates/request";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getSettings } from "@/lib/queries/settings";

export async function IntegrationUsagePanel({
  projectRef,
  editBudget,
}: Readonly<{
  projectRef: string;
  editBudget: boolean;
}>) {
  const { resolved: dateFormat } = await getResolvedDateFormat();
  const [settings, access, runtime] = await Promise.all([
    getSettings(projectRef, { dateFormat }),
    requireReadableProject(projectRef),
    resolveRegionalDocumentLocale(),
  ]);
  // A nested boundary replaces its parent's payload, so the settings-card chrome this panel
  // renders inside has to be restated here: SettingsCard reads `projectSettingsShell.card`.
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectSettingsShell",
    "projectSettingsUsage",
  ]);
  const role = getProjectRole(access.actor, access.project.id);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <div className="max-w-[760px]">
        <ProviderUsageCard
          canEditBudget={
            access.project.writeMode === "active" && canProjectAction(role, "manage", "project")
          }
          initialBudgetEditOpen={editBudget}
          projectId={settings.project.projectId}
          projectRef={projectRef}
          updateProviderAllocation={updateProviderConnectionAllocationAction}
          usage={settings.usage}
        />
      </div>
    </FeatureMessagesProvider>
  );
}
