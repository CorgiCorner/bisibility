import { OnboardingEntryAnalytics } from "@/components/analytics/OnboardingEntryAnalytics";
import { locationFieldValueFromKeywordLocation } from "@/components/keywords/location-field-value";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import {
  buildOnboardingStepHref,
  clampOnboardingStep,
  maxSupportedOnboardingStep,
  normalizeOnboardingDevices,
  normalizeOnboardingStep,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import type { OnboardingWizardActions } from "@/components/onboarding/onboarding-wizard-actions";
import { addKeywordsMatrix } from "@/lib/actions/keyword";
import { importTopQueries } from "@/lib/actions/keyword-suggest";
import { completeProjectOnboarding } from "@/lib/actions/project";
import { createProjectMarket } from "@/lib/actions/project-market-create";
import {
  completeGooglePropertySelection,
  connectProvider,
  loadStoredGoogleProperties,
  saveStoredGoogleProperty,
  testConnection,
} from "@/lib/actions/providers";
import {
  getObservedPositions,
  listFirstCheckCandidates,
  runFirstCheckPreview,
} from "@/lib/actions/rank-check-preview";
import { fetchRankedKeywordSuggestions } from "@/lib/actions/ranked-keywords";
import { installSampleData } from "@/lib/actions/sample-data";
import { updateDefaultRankCheckSettings } from "@/lib/actions/settings";
import { syncProjectTraffic } from "@/lib/actions/traffic-sync";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { dataResidencyMessage } from "@/lib/deployment/deployment";
import { googleOAuthErrorCopy } from "@/lib/integrations/google-oauth-copy";
import { MAX_ONBOARDING_WEBSITE_LENGTH } from "@/lib/onboarding/website";
import { isGoogleOAuthConfigured } from "@/lib/providers/analytics/google-client";
import { getPendingGoogleOAuthSetup } from "@/lib/providers/analytics/google-oauth-pending";
import { requireReadableProject } from "@/lib/queries/_auth";
import {
  getOnboardingGscPropertyLabel,
  getOnboardingKeywordCount,
  getOnboardingKeywordTexts,
  getOnboardingLocationDetails,
  getOnboardingNextCheckAt,
  getOnboardingTrackingStartedAt,
} from "@/lib/queries/onboarding";
import { getRequestProjectDefaults } from "@/lib/queries/workspace-request-data";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { DEFAULT_MONTHLY_COST_CAP_CENTS } from "@/lib/rank-check/budget";
import { serpDepthValues } from "@/lib/serp/constants";
import { redirect } from "next/navigation";
import { createOnboardingProject, deriveOnboardingWebsite, saveOnboardingMarkets } from "./actions";
import { resolveOnboardingLocations } from "./onboarding-location-state";
import { getOnboardingProviderState } from "./onboarding-provider-state";
import { updateOnboardingProject } from "./update-project";

// Restore ownership matching with issue #863:
// import { saveMatchingScope } from "./actions";
type OnboardingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};
type SearchParamValue = string | string[] | undefined;
function paramValue(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}
function paramValues(value: SearchParamValue) {
  return value ? (Array.isArray(value) ? value : [value]) : [];
}

function gscCallbackSucceeded(params: Record<string, string | string[] | undefined> | undefined) {
  return paramValue(params?.google) === "connected" && paramValue(params?.provider) === "gsc";
}

export default async function OnboardingPage({ searchParams }: Readonly<OnboardingPageProps>) {
  const params = await searchParams;
  const websitePrefill = paramValue(params?.website)?.slice(0, MAX_ONBOARDING_WEBSITE_LENGTH);
  const requestedStep = paramValue(params?.step);
  const currentStep = normalizeOnboardingStep(params?.step);
  const workspaces = await listWorkspaces();
  const requestedProjectId = paramValue(params?.projectId) ?? null;
  const gscJustConnected = gscCallbackSucceeded(params);
  // Explicit new-project and landing website handoffs must not resume an existing project.
  const isNewWorkspace = paramValue(params?.new) === "1" || Boolean(websitePrefill);
  const activeProjectRef = isNewWorkspace
    ? null
    : (requestedProjectId ?? workspaces[0]?.publicId ?? null);
  const project = activeProjectRef
    ? (await requireReadableProject(activeProjectRef)).project
    : null;
  const projectId = project?.publicId ?? null;
  const googleStatus = paramValue(params?.google);
  const googleProvider = paramValue(params?.provider);
  const [
    keywordCount,
    initialKeywordTexts,
    providerState,
    connectedGscPropertyLabel,
    googleOAuth,
    projectDefaults,
    nextCheckAt,
    trackingStartedAt,
  ] = project
    ? await Promise.all([
        getOnboardingKeywordCount(project.publicId),
        getOnboardingKeywordTexts(project.publicId),
        getOnboardingProviderState(project.publicId),
        getOnboardingGscPropertyLabel(project.id),
        googleStatus === "select" && googleProvider === "gsc"
          ? getPendingGoogleOAuthSetup(project.publicId)
          : googleStatus === "error" && googleProvider === "gsc"
            ? {
                error: googleOAuthErrorCopy(
                  paramValue(params?.reason),
                  "Google connection wasn't completed. Try again with the account that owns the property.",
                ),
                properties: [],
              }
            : null,
        getRequestProjectDefaults(project.id),
        getOnboardingNextCheckAt(project.publicId),
        getOnboardingTrackingStartedAt(project.publicId),
      ])
    : [0, [], await getOnboardingProviderState(null), null, null, null, null, null];
  const initialKeywordText = initialKeywordTexts[0] ?? null;
  const locations = await resolveOnboardingLocations({
    countryValues: paramValues(params?.country),
    locValues: paramValues(params?.loc),
    projectId,
  });
  const deviceValues = paramValues(params?.device);
  const devices =
    deviceValues.length > 0
      ? normalizeOnboardingDevices(deviceValues)
      : normalizeOnboardingDevices(projectDefaults?.device ? [projectDefaults.device] : undefined);
  const flowState: OnboardingFlowState = {
    devices,
    locations,
    projectId,
    providerId: paramValue(params?.providerId) ?? providerState.providerId,
  };
  const initialProject = project
    ? {
        ...project,
        trackingStartedAt,
        device: projectDefaults?.device ?? undefined,
        frequency: projectDefaults?.frequency,
        cronExpression: projectDefaults?.cronExpression,
        jitterMinutes: projectDefaults?.jitterMinutes,
        serpDepth: serpDepthValues.find((depth) => depth === projectDefaults?.serpDepth),
        timezone: projectDefaults?.timezone ?? "UTC",
      }
    : null;

  // A workspace row can exist before the user names a domain. Skipping to
  // Connect data would hide the required website field.
  if (project?.domain && currentStep === 1 && !requestedStep) {
    redirect(buildOnboardingStepHref(2, flowState));
  }

  if (!project?.domain && currentStep > 1) {
    redirect(buildOnboardingStepHref(1, project ? flowState : undefined));
  }

  const supportedStep = clampOnboardingStep(
    currentStep,
    maxSupportedOnboardingStep({
      keywordCount,
      projectId: project?.domain ? projectId : null,
    }),
  );

  if (supportedStep !== currentStep) {
    redirect(buildOnboardingStepHref(supportedStep, flowState));
  }

  const actions = {
    addKeywordsAction: addKeywordsMatrix,
    completeGooglePropertySelectionAction: completeGooglePropertySelection,
    completeOnboardingAction: completeProjectOnboarding,
    connectProviderAction: connectProvider,
    createMarketAction: createProjectMarket,
    createProjectAction: createOnboardingProject,
    updateProjectAction: updateOnboardingProject,
    deriveWebsiteAction: deriveOnboardingWebsite,
    getObservedPositionsAction: getObservedPositions,
    importTopQueriesAction: importTopQueries,
    fetchRankedKeywordSuggestionsAction: fetchRankedKeywordSuggestions,
    installSampleDataAction: (await getInstanceAdminSession()) ? installSampleData : undefined,
    loadStoredGooglePropertiesAction: loadStoredGoogleProperties,
    listFirstCheckCandidatesAction: listFirstCheckCandidates,
    runFirstCheckPreviewAction: runFirstCheckPreview,
    saveMarketsAction: saveOnboardingMarkets,
    saveStoredGooglePropertyAction: saveStoredGoogleProperty,
    // saveMatchingScopeAction: saveMatchingScope, // Restore with issue #863.
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
          A few quick steps to start tracking your website.
        </p>
      </section>

      <OnboardingEntryAnalytics />
      <OnboardingWizard
        actions={actions}
        costPerCheckCents={providerState.costPerCheckCents}
        dataResidencyMessage={dataResidencyMessage()}
        gscJustConnected={gscJustConnected}
        gscOAuthConfigured={isGoogleOAuthConfigured()}
        gscGoogleOAuth={googleOAuth}
        gscPropertyLabel={connectedGscPropertyLabel}
        hasAnalyticsSource={providerState.hasAnalyticsSource}
        hasOtherAnalyticsSource={providerState.hasOtherAnalyticsSource}
        initialFlowState={flowState}
        initialLocationSelections={(await getOnboardingLocationDetails(locations)).map((row) =>
          locationFieldValueFromKeywordLocation(row),
        )}
        initialKeywordCount={keywordCount}
        initialKeywordText={initialKeywordText}
        initialKeywordDraft={initialKeywordTexts.join("\n")}
        initialFirstCheckCandidates={
          currentStep === 4 && projectId && initialKeywordText
            ? (
                await listFirstCheckCandidates({
                  projectId,
                  keywordText: initialKeywordText,
                  includeExisting: true,
                  limit: Math.max(1, locations.length * devices.length),
                })
              ).candidates
            : undefined
        }
        initialProject={initialProject}
        initialWebsite={project?.domain ? undefined : websitePrefill}
        initialSerpConnections={providerState.serpConnections}
        initialStep={currentStep}
        monthlyCapCents={project?.budgetCapCents ?? DEFAULT_MONTHLY_COST_CAP_CENTS}
        nextCheckAt={nextCheckAt?.toISOString() ?? null}
        providerConnected={providerState.providerConnected}
        rankedKeywordConnections={providerState.rankedKeywordConnections}
      />
    </>
  );
}
