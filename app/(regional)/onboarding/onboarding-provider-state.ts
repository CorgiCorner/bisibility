import type { ConnectedProviderMap } from "@/components/onboarding/steps/StepConnectProvider.fields";
import { requireApiPublicId } from "@/lib/api/public-id";
import { getProjectCostContext } from "@/lib/queries/cost-calculator";
import { getIntegrationCategories } from "@/lib/queries/integrations";
import { listEligibleRankedKeywordConnections } from "@/lib/ranked-keywords/service";

type IntegrationCategories = Awaited<ReturnType<typeof getIntegrationCategories>>;
function connectedSerpProvider(categories: IntegrationCategories) {
  const providers = categories.find((category) => category.id === "serp")?.providers ?? [];
  return (
    providers.find(
      (provider) =>
        provider.status === "connected" && provider.enabled !== false && provider.primary,
    ) ??
    providers.find((provider) => provider.status === "connected" && provider.enabled !== false) ??
    null
  );
}

// Saved connections let step 3 restore each provider card's verified state.
function serpConnectionsMap(categories: IntegrationCategories): ConnectedProviderMap {
  const providers = categories.find((category) => category.id === "serp")?.providers ?? [];
  const map: ConnectedProviderMap = {};
  for (const provider of providers) {
    if (
      (provider.id === "dataforseo" || provider.id === "serpapi") &&
      provider.status === "connected" &&
      provider.enabled !== false
    ) {
      map[provider.id] = {};
    }
  }
  return map;
}

function connectedAnalyticsSource(categories: IntegrationCategories) {
  const providers = categories.find((category) => category.id === "analytics")?.providers ?? [];
  return providers.some(
    (provider) => provider.status === "connected" && provider.enabled !== false,
  );
}

export async function getOnboardingProviderState(projectId: string | null) {
  if (!projectId) {
    return {
      costPerCheckCents: null,
      hasAnalyticsSource: false,
      hasOtherAnalyticsSource: false,
      providerConnected: false,
      providerId: null,
      rankedKeywordConnections: [],
      serpConnections: {} as ConnectedProviderMap,
    };
  }

  const [categories, rankedKeywordConnections, costContext] = await Promise.all([
    getIntegrationCategories(projectId),
    listEligibleRankedKeywordConnections(projectId),
    getProjectCostContext(projectId),
  ]);
  const provider = connectedSerpProvider(categories);

  return {
    costPerCheckCents: costContext.costPerCheckCents,
    hasAnalyticsSource: connectedAnalyticsSource(categories),
    hasOtherAnalyticsSource: connectedAnalyticsSource(
      categories.map((category) => ({
        ...category,
        providers: category.providers.filter((provider) => provider.id !== "gsc"),
      })),
    ),
    providerConnected: Boolean(provider),
    providerId: provider?.id ?? null,
    rankedKeywordConnections: rankedKeywordConnections.map((connection) => ({
      ...connection,
      id: requireApiPublicId(connection.id, "conn"),
    })),
    serpConnections: serpConnectionsMap(categories),
  };
}
