import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { IntegrationUsagePanel } from "@/components/integrations/IntegrationUsagePanel";
import type { BillingConnection } from "@/components/integrations/ProviderBillingCard";
import { PageContent } from "@/components/shell/PageContent";
import { UsageCosts } from "@/components/usage/UsageCosts";
import { usageBlocks, usagePageClassName } from "@/components/usage/usage-page-layout";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import {
  createCostItemAction,
  deleteCostItemAction,
  endCostItemAction,
  updateCostItemAction,
} from "@/lib/actions/cost-items";
import { readUsageCosts } from "@/lib/cost-items/read";
import { deploymentMode } from "@/lib/deployment/deployment";
import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getIntegrationsView } from "@/lib/queries/integrations";

export default async function UsagePage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const [{ project }, runtime] = await Promise.all([params, resolveRegionalDocumentLocale()]);
  const { publicId } = await resolveProjectAccess(project);
  const [{ categories }, messages, costs, query] = await Promise.all([
    getIntegrationsView(publicId),
    loadCoreMessages(runtime.locale, ["shared", "projectIntegrations", "projectUsageCosts"]),
    readUsageCosts(publicId),
    searchParams,
  ]);
  const connections: BillingConnection[] = categories.flatMap((category) =>
    category.providers.flatMap((provider) => {
      if (!provider.connectionId) return [];
      const catalog = PROVIDER_CATALOG.find((entry) => entry.id === provider.id);
      return [
        {
          connectionId: provider.connectionId,
          providerId: provider.id,
          label: provider.name,
          credentialSource: provider.credentialSource ?? "own",
          billable: catalog?.kind !== "analytics" && catalog?.allocation.kind === "billable",
        },
      ];
    }),
  );
  return (
    <FeatureMessagesProvider
      locale={runtime.locale}
      messages={messages}
      timeZone={runtime.timeZone}
    >
      <PageContent className={usagePageClassName} data-usage-blocks={usageBlocks.join(" ")}>
        <UsageCosts
          createItem={createCostItemAction}
          deleteItem={deleteCostItemAction}
          endItem={endCostItemAction}
          updateItem={updateCostItemAction}
          view={costs}
        >
          <IntegrationUsagePanel
            projectRef={publicId}
            editBudget={query?.budget === "edit"}
            connections={
              deploymentMode() === "self-host"
                ? connections.filter((row) => row.credentialSource !== "hosted")
                : connections
            }
          />
        </UsageCosts>
      </PageContent>
    </FeatureMessagesProvider>
  );
}
