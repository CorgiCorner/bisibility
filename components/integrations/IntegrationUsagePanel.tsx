import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { renderAccountUsageBudgetExtension } from "@/components/settings/AccountDataSourceExtension";
import { ProviderUsageCard } from "@/components/settings/usage/ProviderUsageCard";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { updateProviderConnectionAllocationAction } from "@/lib/actions/provider-allocation";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { getResolvedDateFormat } from "@/lib/dates/request";
import { getProjectMeteringUsage } from "@/lib/metering/user-data";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getSettings } from "@/lib/queries/settings";
import { MeterUsageCard } from "./MeterUsageCard";

export async function IntegrationUsagePanel({
  projectRef,
  editBudget,
}: Readonly<{
  projectRef: string;
  editBudget: boolean;
}>) {
  const { resolved: dateFormat } = await getResolvedDateFormat();
  const [settings, access, runtime, metering] = await Promise.all([
    getSettings(projectRef, { dateFormat }),
    requireReadableProject(projectRef),
    resolveRegionalDocumentLocale(),
    getProjectMeteringUsage(projectRef),
  ]);
  // A nested boundary replaces its parent's payload, so the settings-card chrome this panel
  // renders inside has to be restated here: SettingsCard reads `projectSettingsShell.card`.
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectSettingsShell",
    "projectSettingsUsage",
  ]);
  const budgetExtension = await renderAccountUsageBudgetExtension({
    locale: runtime.locale,
    principalId: access.actor.id,
    projectId: access.project.id,
    projectRef,
  });
  const role = getProjectRole(access.actor, access.project.id);
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <div className="flex max-w-[760px] flex-col gap-4">
        <ProviderUsageCard
          budgetExplanation={budgetExtension?.description}
          canEditBudget={
            access.project.writeMode === "active" && canProjectAction(role, "manage", "project")
          }
          credits={budgetExtension?.credits ?? null}
          initialBudgetEditOpen={editBudget}
          projectId={settings.project.projectId}
          projectRef={projectRef}
          updateProviderAllocation={updateProviderConnectionAllocationAction}
          usage={settings.usage}
        />
        <MeterUsageCard data={metering} />
        {budgetExtension?.content}
      </div>
    </FeatureMessagesProvider>
  );
}
