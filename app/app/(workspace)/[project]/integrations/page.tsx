import { IntegrationCategory } from "@/components/integrations/IntegrationCategory";
import { PageContent } from "@/components/shell/PageContent";
import { Card } from "@/components/ui";
import {
  connectProvider,
  disconnectProvider,
  setPrimaryProvider,
  testConnection,
  updateProviderCost,
  updateProviderRate,
} from "@/lib/actions/providers";
import { syncProjectTraffic } from "@/lib/actions/traffic-sync";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import type { GoogleOAuthSetup, ProviderActionHandlers } from "@/lib/integrations/types";
import { getPendingGoogleOAuthSetup } from "@/lib/providers/analytics/google-oauth-pending";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getIntegrationsView } from "@/lib/queries/integrations";
import { KeyIcon as Key } from "@phosphor-icons/react/dist/ssr";

const providerActions = {
  connectProvider,
  disconnectProvider,
  setPrimaryProvider,
  syncProjectTraffic,
  testProviderConnection: testConnection,
  updateProviderCost,
  updateProviderRate,
} satisfies ProviderActionHandlers;

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
  const googleStatus = readParam(params, "google");
  const googleProvider = readParam(params, "provider");
  const initialConnectProviderId = readParam(params, "connect") ?? googleProvider;
  let googleOAuth: GoogleOAuthSetup | null | undefined;
  if (googleStatus === "select" && (googleProvider === "gsc" || googleProvider === "ga4")) {
    googleOAuth = await getPendingGoogleOAuthSetup(publicId);
  } else if (googleStatus === "error" && (googleProvider === "gsc" || googleProvider === "ga4")) {
    googleOAuth = {
      error:
        "Google connection wasn't completed. Try again and choose the account that has access to the property.",
      properties: [],
      provider: googleProvider,
    };
  }
  const [{ categories, connectionCount }, readable] = await Promise.all([
    getIntegrationsView(publicId, {
      googleOAuth: googleOAuth ?? undefined,
      now: new Date(),
    }),
    requireReadableProject(publicId),
  ]);
  const role = getProjectRole(readable.actor, readable.project.id);
  const canManageProviders = canProjectAction(role, "manage", "provider_connection");
  const canUpdateProject = canProjectAction(role, "update", "project");
  const noProvidersYet = connectionCount === 0;

  return (
    <PageContent className="flex flex-col gap-5">
      <Card className="flex items-start gap-[11px] rounded-xl px-4 py-[14px]" size="md">
        <span className="flex h-5 shrink-0 items-center text-accent">
          <Key aria-hidden size={17} weight="fill" />
        </span>
        <p className="m-0 text-[13px] leading-[1.5] text-fg-muted">
          <strong className="font-semibold text-fg">Bring your own providers.</strong> In
          self-hosted bisibility you connect your own accounts. Credentials stay in your instance
          and provider usage is billed directly between you and each provider.
        </p>
      </Card>

      <div className="flex flex-col gap-5 scroll-mt-6" id="all-providers">
        {categories.map((category) => (
          <IntegrationCategory
            actions={providerActions}
            canManageProviders={canManageProviders}
            canUpdateProject={canUpdateProject}
            category={category}
            initialConnectProviderId={canManageProviders ? initialConnectProviderId : undefined}
            key={category.id}
            noProvidersYet={noProvidersYet}
            projectId={publicId}
            projectRef={publicId}
          />
        ))}
      </div>
    </PageContent>
  );
}
