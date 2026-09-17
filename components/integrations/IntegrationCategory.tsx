"use client";

// The category headings come from the integrations page's FeatureMessagesProvider. As a Server
// Component this section resolved `projectIntegrations.categories` against the `shared`-only
// request config and baked the raw keys into the RSC payload.

import { ProviderCard } from "@/components/integrations/ProviderCard";
import { SerpFallbackOrder } from "@/components/integrations/SerpFallbackOrder";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { IntegrationCategoryData, ProviderActionHandlers } from "@/lib/integrations/types";
import type { ProjectRef } from "@/lib/routing/app-path";
import type { SearchSyncPreflightPlan } from "@/lib/search-insights/sync/plan";
import { useTranslations } from "next-intl";
import { ProviderConsumerPanel } from "./ProviderConsumerPanel";
import { providerConsumerStatuses } from "./provider-card-config";

export type IntegrationCategoryProps = {
  actions?: ProviderActionHandlers;
  canManageProviders: boolean;
  canUpdateProject: boolean;
  category: IntegrationCategoryData;
  deploymentMode?: "cloud" | "self-host";
  initialConnectProviderId?: string;
  noProvidersYet?: boolean;
  projectId?: string;
  projectRef?: ProjectRef;
  searchSyncPlan?: SearchSyncPreflightPlan;
  timeZone: string;
};

export function IntegrationCategory({
  actions,
  canManageProviders,
  canUpdateProject,
  category,
  deploymentMode,
  initialConnectProviderId,
  noProvidersYet = false,
  projectId,
  projectRef,
  searchSyncPlan,
  timeZone,
}: Readonly<IntegrationCategoryProps>) {
  const t = useTranslations("projectIntegrations.categories");
  const title = category.id === "serp" ? t("serpTitle") : t("analyticsTitle");
  const description = category.id === "serp" ? t("serpDescription") : t("analyticsDescription");
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2.5">
          <SectionTitle component="h2" size="md">
            {title}
          </SectionTitle>
        </div>
        <p className="m-0 max-w-3xl text-[12.5px] leading-5 text-fg-muted">{description}</p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,19rem),1fr))] items-stretch gap-3">
        {category.providers.map((provider, index) => {
          const isFirstSerpProvider = category.id === "serp" && index === 0;

          return (
            <ProviderCard
              actions={actions}
              canManageProviders={canManageProviders}
              canUpdateProject={canUpdateProject}
              consumerDetails="separate"
              deploymentMode={deploymentMode}
              initialOpen={initialConnectProviderId === provider.id}
              key={provider.id}
              noProvidersYet={noProvidersYet && isFirstSerpProvider}
              projectId={projectId}
              projectRef={projectRef}
              provider={provider}
              searchSyncPlan={searchSyncPlan}
              timeZone={timeZone}
            />
          );
        })}
      </div>
      {category.providers
        .filter((provider) => providerConsumerStatuses(provider))
        .map((provider) => (
          <ProviderConsumerPanel
            actions={actions}
            canUpdateProject={canUpdateProject}
            key={provider.id}
            projectId={projectId}
            projectRef={projectRef}
            provider={provider}
            timeZone={timeZone}
          />
        ))}
      {category.id === "serp" ? (
        <SerpFallbackOrder
          actions={actions}
          canManageProviders={canManageProviders}
          projectId={projectId}
          providers={category.providers}
        />
      ) : null}
    </section>
  );
}
