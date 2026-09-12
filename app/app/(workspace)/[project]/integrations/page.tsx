import { IntegrationCategory } from "@/components/integrations/IntegrationCategory";
import { IntegrationsTabs } from "@/components/integrations/IntegrationsTabs";
import { IntegrationUsagePanel } from "@/components/integrations/IntegrationUsagePanel";
import { PageContent } from "@/components/shell/PageContent";
import {
  completeGooglePropertySelection,
  connectProvider,
  disconnectProvider,
  loadStoredGoogleProperties,
  saveStoredGoogleProperty,
  testConnection,
  updateProviderCost,
  updateProviderRate,
  updateProviderSettings,
} from "@/lib/actions/providers";
import { syncProjectTraffic } from "@/lib/actions/traffic-sync";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { getResolvedDateFormat } from "@/lib/dates/request";
import { deploymentMode } from "@/lib/deployment/deployment";
import { googleOAuthErrorCopy } from "@/lib/integrations/google-oauth-copy";
import type { GoogleOAuthSetup, ProviderActionHandlers } from "@/lib/integrations/types";
import { getPendingGoogleOAuthSetup } from "@/lib/providers/analytics/google-oauth-pending";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getIntegrationsView } from "@/lib/queries/integrations";
import { loadSearchSyncPreflightPlan } from "@/lib/settings/search-sync-metrics";

type IntegrationsProviderActions = ProviderActionHandlers &
  Required<Pick<ProviderActionHandlers, "completeGooglePropertySelection">>;

const providerActions = {
  completeGooglePropertySelection,
  connectProvider,
  disconnectProvider,
  loadStoredGoogleProperties,
  saveStoredGoogleProperty,
  syncProjectTraffic,
  testProviderConnection: testConnection,
  updateProviderSettings,
  updateProviderCost,
  updateProviderRate,
} satisfies IntegrationsProviderActions;

type IntegrationsPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(params: Record<string, string | string[] | undefined> | undefined, key: string) {
  const value = params?.[key];

  return Array.isArray(value) ? value[0] : value;
}

export default async function IntegrationsPage({
  params: routeParams,
  searchParams,
}: Readonly<IntegrationsPageProps>) {
  const { project } = await routeParams;
  const { publicId } = await resolveProjectAccess(project);
  const params = await searchParams;
  if (readParam(params, "tab") === "usage") {
    return (
      <PageContent className="flex flex-col gap-5">
        <IntegrationsTabs active="usage" projectRef={publicId} />
        <div aria-labelledby="integrations-panel-usage-tab" id="integrations-panel" role="tabpanel">
          <IntegrationUsagePanel
            editBudget={readParam(params, "budget") === "edit"}
            projectRef={publicId}
          />
        </div>
      </PageContent>
    );
  }
  const googleStatus = readParam(params, "google");
  const googleProvider = readParam(params, "provider");
  const initialConnectProviderId = readParam(params, "connect") ?? googleProvider;
  let googleOAuth: GoogleOAuthSetup | null | undefined;
  if (googleStatus === "select" && (googleProvider === "gsc" || googleProvider === "ga4")) {
    googleOAuth = await getPendingGoogleOAuthSetup(publicId);
  } else if (googleStatus === "error" && (googleProvider === "gsc" || googleProvider === "ga4")) {
    googleOAuth = {
      error: googleOAuthErrorCopy(
        readParam(params, "reason"),
        "Google connection wasn't completed. Try again and choose the account that has access to the property.",
      ),
      properties: [],
      provider: googleProvider,
    };
  }
  const { resolved: dateFormat } = await getResolvedDateFormat();
  const [{ categories, connectionCount, timeZone }, readable, searchSyncPlan] = await Promise.all([
    getIntegrationsView(publicId, {
      dateFormat,
      googleOAuth: googleOAuth ?? undefined,
      now: new Date(),
    }),
    requireReadableProject(publicId),
    loadSearchSyncPreflightPlan(publicId),
  ]);
  const role = getProjectRole(readable.actor, readable.project.id);
  const canManageProviders = canProjectAction(role, "manage", "provider_connection");
  const canUpdateProject = canProjectAction(role, "update", "project");
  const noProvidersYet = connectionCount === 0;

  return (
    <PageContent className="flex flex-col gap-5">
      <IntegrationsTabs active="connections" projectRef={publicId} />
      <div
        aria-labelledby="integrations-panel-connections-tab"
        id="integrations-panel"
        role="tabpanel"
      >
        <div className="flex flex-col gap-5 scroll-mt-6" id="all-providers">
          {categories.map((category) => (
            <IntegrationCategory
              actions={providerActions}
              canManageProviders={canManageProviders}
              canUpdateProject={canUpdateProject}
              category={category}
              deploymentMode={deploymentMode()}
              initialConnectProviderId={canManageProviders ? initialConnectProviderId : undefined}
              key={category.id}
              noProvidersYet={noProvidersYet}
              projectId={publicId}
              projectRef={publicId}
              searchSyncPlan={searchSyncPlan}
              timeZone={timeZone}
            />
          ))}
        </div>
      </div>
    </PageContent>
  );
}
