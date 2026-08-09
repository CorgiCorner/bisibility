import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import {
  buildOnboardingStepHref,
  clampOnboardingStep,
  maxSupportedOnboardingStep,
  normalizeOnboardingDevices,
  normalizeOnboardingStep,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import {
  DEFAULT_ONBOARDING_LOCATION_KEY,
  legacyCountryLocationCandidates,
  MAX_ONBOARDING_LOCATIONS,
  onboardingLocationCandidates,
  uniqueLocationCandidates,
} from "@/components/onboarding/onboarding-locations";
import type { OnboardingWizardActions } from "@/components/onboarding/onboarding-wizard-actions";
import type { ConnectedProviderMap } from "@/components/onboarding/steps/StepConnectProvider.fields";
import { issueApiKey } from "@/lib/actions/apiKey";
import { addKeywordsMatrix } from "@/lib/actions/keyword";
import { importTopQueries } from "@/lib/actions/keyword-suggest";
import { completeProjectOnboarding } from "@/lib/actions/project";
import {
  completeGooglePropertySelection,
  connectProvider,
  testConnection,
} from "@/lib/actions/providers";
import {
  getObservedPositions,
  listFirstCheckCandidates,
  runFirstCheckPreview,
} from "@/lib/actions/rank-check-preview";
import { queueFirstChecks } from "@/lib/actions/rankCheck";
import { fetchRankedKeywordSuggestions } from "@/lib/actions/ranked-keywords";
import { installSampleData } from "@/lib/actions/sample-data";
import { updateDefaultRankCheckSettings } from "@/lib/actions/settings";
import { syncProjectTraffic } from "@/lib/actions/traffic-sync";
import { requireApiPublicId } from "@/lib/api/public-id";
import { dataResidencyMessage, isCloud } from "@/lib/deployment/deployment";
import { isGoogleOAuthConfigured } from "@/lib/providers/analytics/google-client";
import { getPendingGoogleOAuthSetup } from "@/lib/providers/analytics/google-oauth-pending";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getProjectCostContext } from "@/lib/queries/cost-calculator";
import { getIntegrationCategories } from "@/lib/queries/integrations";
import { getKeywordCount } from "@/lib/queries/keywords";
import {
  existingOnboardingCityLocationKeys,
  getOnboardingGscPropertyLabel,
  hasActiveOnboardingApiKey,
} from "@/lib/queries/onboarding";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { DEFAULT_MONTHLY_COST_CAP_CENTS } from "@/lib/rank-check/budget";
import { listEligibleRankedKeywordConnections } from "@/lib/ranked-keywords/service";
import { redirect } from "next/navigation";
import { createOnboardingProject, saveMatchingScope } from "./actions";

type OnboardingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type SearchParamValue = string | string[] | undefined;

function paramValue(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function paramValues(value: SearchParamValue) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

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

// Saved SERP connections keyed by provider so step 3 can render each card's
// connected/verified state on load instead of resetting to "Not tested yet".
function serpConnectionsMap(categories: IntegrationCategories): ConnectedProviderMap {
  const providers = categories.find((category) => category.id === "serp")?.providers ?? [];
  const map: ConnectedProviderMap = {};
  for (const provider of providers) {
    if (
      (provider.id === "dataforseo" || provider.id === "serpapi") &&
      provider.status === "connected" &&
      provider.enabled !== false
    ) {
      map[provider.id] = { primary: Boolean(provider.primary) };
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

function gscCallbackSucceeded(params: Record<string, string | string[] | undefined> | undefined) {
  return paramValue(params?.google) === "connected" && paramValue(params?.provider) === "gsc";
}

async function getOnboardingProviderState(projectId: string | null) {
  if (!projectId) {
    return {
      costPerCheckCents: null,
      hasAnalyticsSource: false,
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
    providerConnected: Boolean(provider),
    providerId: provider?.id ?? null,
    rankedKeywordConnections: rankedKeywordConnections.map((connection) => ({
      ...connection,
      id: requireApiPublicId(connection.id, "conn"),
    })),
    serpConnections: serpConnectionsMap(categories),
  };
}

async function normalizeOnboardingLocations(
  locValues: readonly string[],
  countryValues: readonly string[],
) {
  const candidates = uniqueLocationCandidates([
    ...onboardingLocationCandidates(locValues),
    ...legacyCountryLocationCandidates(countryValues),
  ]);
  const cityKeys = candidates
    .filter((candidate) => candidate.kind === "city")
    .map((candidate) => candidate.key);
  const existingCityKeys = await existingOnboardingCityLocationKeys(cityKeys);
  const locations = candidates.flatMap((candidate) => {
    if (candidate.kind === "country" || existingCityKeys.has(candidate.key)) {
      return [candidate.key];
    }
    return [];
  });
  return (locations.length > 0 ? locations : [DEFAULT_ONBOARDING_LOCATION_KEY]).slice(
    0,
    MAX_ONBOARDING_LOCATIONS,
  );
}

export default async function OnboardingPage({ searchParams }: Readonly<OnboardingPageProps>) {
  const params = await searchParams;
  const requestedStep = paramValue(params?.step);
  const currentStep = normalizeOnboardingStep(params?.step);
  const workspaces = await listWorkspaces();
  const requestedProjectId = paramValue(params?.projectId) ?? null;
  const gscJustConnected = gscCallbackSucceeded(params);
  // "Create project" passes ?new=1 to force a fresh project from step 1, instead of
  // resuming the actor's existing project at the provider step.
  const isNewWorkspace = paramValue(params?.new) === "1";
  const activeProjectRef = isNewWorkspace
    ? null
    : (requestedProjectId ?? workspaces[0]?.publicId ?? null);
  const project = activeProjectRef
    ? (await requireReadableProject(activeProjectRef)).project
    : null;
  const projectId = project?.publicId ?? null;
  const googleStatus = paramValue(params?.google);
  const googleProvider = paramValue(params?.provider);
  const [keywordCount, providerState, connectedGscPropertyLabel, hasApiKey, googleOAuth] = projectId
    ? await Promise.all([
        getKeywordCount(projectId),
        getOnboardingProviderState(projectId),
        getOnboardingGscPropertyLabel(project?.id ?? null),
        hasActiveOnboardingApiKey(project?.id ?? null),
        googleStatus === "select" && googleProvider === "gsc"
          ? getPendingGoogleOAuthSetup(projectId)
          : googleStatus === "error" && googleProvider === "gsc"
            ? {
                error:
                  "Google connection wasn't completed. Try again with the account that owns the property.",
                properties: [],
              }
            : null,
      ])
    : [0, await getOnboardingProviderState(null), null, false, null];
  const locations = await normalizeOnboardingLocations(
    paramValues(params?.loc),
    paramValues(params?.country),
  );
  const devices = normalizeOnboardingDevices(paramValues(params?.device));
  const flowState: OnboardingFlowState = {
    devices,
    locations,
    projectId,
    providerId: paramValue(params?.providerId) ?? providerState.providerId,
  };

  if (project && currentStep === 1 && !requestedStep) {
    redirect(buildOnboardingStepHref(2, flowState));
  }

  if (!project && currentStep > 1) {
    redirect(buildOnboardingStepHref(1));
  }

  const supportedStep = clampOnboardingStep(
    currentStep,
    maxSupportedOnboardingStep({ keywordCount, projectId }),
  );

  if (supportedStep !== currentStep) {
    redirect(buildOnboardingStepHref(supportedStep, flowState));
  }

  const actions = {
    addKeywordsAction: addKeywordsMatrix,
    completeGooglePropertySelectionAction: completeGooglePropertySelection,
    completeOnboardingAction: completeProjectOnboarding,
    connectProviderAction: connectProvider,
    createProjectAction: createOnboardingProject,
    getObservedPositionsAction: getObservedPositions,
    importTopQueriesAction: importTopQueries,
    fetchRankedKeywordSuggestionsAction: fetchRankedKeywordSuggestions,
    installSampleDataAction: installSampleData,
    issueApiKeyAction: issueApiKey,
    listFirstCheckCandidatesAction: listFirstCheckCandidates,
    queueFirstChecksAction: queueFirstChecks,
    runFirstCheckPreviewAction: runFirstCheckPreview,
    saveMatchingScopeAction: saveMatchingScope,
    syncProjectTrafficAction: syncProjectTraffic,
    testProviderConnectionAction: testConnection,
    updateProjectDefaultsAction: updateDefaultRankCheckSettings,
  } satisfies OnboardingWizardActions;

  return (
    <>
      <section className="mt-6">
        <h1 className="m-0 text-[30px] font-semibold leading-tight tracking-[-1px]">
          Set up your project
        </h1>
        <p className="m-0 mt-2 max-w-[560px] text-[15px] leading-[1.5] text-fg-muted">
          A few quick steps - everything can be changed later.
        </p>
      </section>

      <OnboardingWizard
        actions={actions}
        costPerCheckCents={providerState.costPerCheckCents}
        dataResidencyMessage={dataResidencyMessage()}
        gscJustConnected={gscJustConnected}
        gscOAuthConfigured={isGoogleOAuthConfigured()}
        gscGoogleOAuth={googleOAuth}
        gscPropertyLabel={connectedGscPropertyLabel}
        hasAnalyticsSource={providerState.hasAnalyticsSource}
        initialHasApiKey={hasApiKey}
        initialFlowState={flowState}
        initialKeywordCount={keywordCount}
        initialProject={project}
        initialSerpConnections={providerState.serpConnections}
        initialStep={currentStep}
        isCloud={isCloud}
        monthlyCapCents={project?.budgetCapCents ?? DEFAULT_MONTHLY_COST_CAP_CENTS}
        providerConnected={providerState.providerConnected}
        rankedKeywordConnections={providerState.rankedKeywordConnections}
      />
    </>
  );
}
