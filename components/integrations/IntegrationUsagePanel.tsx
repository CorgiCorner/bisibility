import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ProviderUiProvider } from "@/components/provider-management/ProviderUiProvider";
import { renderAccountUsageBudgetExtension } from "@/components/settings/AccountDataSourceExtension";
import { ProviderUsageCard } from "@/components/settings/usage/ProviderUsageCard";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { getProjectMeteringUsage } from "@/lib/metering/user-data";
import { requireReadableProject } from "@/lib/queries/_auth";
import { UsageSummary } from "./UsageSummary";

export async function IntegrationUsagePanel({
  projectRef,
  editBudget,
}: Readonly<{
  projectRef: string;
  editBudget: boolean;
}>) {
  const [access, runtime, metering] = await Promise.all([
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
    "projectIntegrations",
  ]);
  const budgetExtension = await renderAccountUsageBudgetExtension({
    locale: runtime.locale,
    principalId: access.actor.id,
    projectId: access.project.id,
    projectRef,
  });
  const role = getProjectRole(access.actor, access.project.id);
  const canEditBudget =
    access.project.writeMode === "active" &&
    canProjectAction(role, "manage", "provider_connection");
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <ProviderUiProvider projectId={projectRef}>
        <div className="flex max-w-[760px] flex-col gap-4">
          <ProviderUsageCard
            budgetExplanation={budgetExtension?.description}
            canEditBudget={canEditBudget}
            initialBudgetEditOpen={editBudget}
            projectId={projectRef}
            projectRef={projectRef}
            data={metering}
          />
          <UsageSummary data={metering} />
          {budgetExtension?.content}
        </div>
      </ProviderUiProvider>
    </FeatureMessagesProvider>
  );
}
