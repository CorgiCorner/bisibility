import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { IntegrationUsagePanel } from "@/components/integrations/IntegrationUsagePanel";
import type { BillingConnection } from "@/components/integrations/ProviderBillingCard";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
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
  const [{ categories }, messages, query] = await Promise.all([
    getIntegrationsView(publicId),
    loadCoreMessages(runtime.locale, ["shared", "projectIntegrations"]),
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
      <PageContent className="flex flex-col gap-5">
        <IntegrationUsagePanel
          projectRef={publicId}
          editBudget={query?.budget === "edit"}
          connections={
            deploymentMode() === "self-host"
              ? connections.filter((row) => row.credentialSource !== "hosted")
              : connections
          }
        />
      </PageContent>
    </FeatureMessagesProvider>
  );
}
