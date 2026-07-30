import { ProviderCard } from "@/components/integrations/ProviderCard";
import { SerpFallbackOrder } from "@/components/integrations/SerpFallbackOrder";
import { MonoText, SectionTitle } from "@/components/ui";
import type { IntegrationCategoryData, ProviderActionHandlers } from "@/lib/integrations/types";
import type { ProjectRef } from "@/lib/routing/app-path";

export type IntegrationCategoryProps = {
  actions?: ProviderActionHandlers;
  canManageProviders: boolean;
  canUpdateProject: boolean;
  category: IntegrationCategoryData;
  initialConnectProviderId?: string;
  noProvidersYet?: boolean;
  projectId?: string;
  projectRef?: ProjectRef;
};

export function IntegrationCategory({
  actions,
  canManageProviders,
  canUpdateProject,
  category,
  initialConnectProviderId,
  noProvidersYet = false,
  projectId,
  projectRef,
}: Readonly<IntegrationCategoryProps>) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2.5">
          <SectionTitle component="h2" size="md">
            {category.title}
          </SectionTitle>
          <MonoText muted>{category.eyebrow}</MonoText>
        </div>
        <p className="m-0 max-w-3xl text-[12.5px] leading-5 text-fg-muted">
          {category.description}
        </p>
      </div>
      {category.id === "serp" ? (
        <SerpFallbackOrder
          actions={actions}
          canManageProviders={canManageProviders}
          projectId={projectId}
          providers={category.providers}
        />
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
        {category.providers.map((provider, index) => {
          const isFirstSerpProvider = category.id === "serp" && index === 0;

          return (
            <ProviderCard
              actions={actions}
              canManageProviders={canManageProviders}
              canUpdateProject={canUpdateProject}
              initialOpen={initialConnectProviderId === provider.id}
              key={provider.id}
              noProvidersYet={noProvidersYet && isFirstSerpProvider}
              projectId={projectId}
              projectRef={projectRef}
              provider={provider}
            />
          );
        })}
      </div>
    </section>
  );
}
