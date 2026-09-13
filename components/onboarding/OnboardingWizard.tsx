"use client";
import { OnboardingNav } from "@/components/onboarding/OnboardingNav";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import type { OnboardingWizardProps } from "@/components/onboarding/OnboardingWizard.types";
import {
  OnboardingWizardSteps,
  type OnboardingWizardStepsProps,
} from "@/components/onboarding/OnboardingWizardSteps";
import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
  type OnboardingStepNumber,
} from "@/components/onboarding/onboarding-fixtures";
import { feedbackClass, keywordLines } from "@/components/onboarding/onboarding-form-utils";
import {
  initialOnboardingDraft,
  projectIdFor,
} from "@/components/onboarding/onboarding-wizard-state";
import { useState } from "react";
import { OnboardingProjectOptions } from "./OnboardingProjectOptions";
import { OnboardingWizardSkipAction } from "./OnboardingWizardSkipAction";
import { readCurrentProviderValues } from "./onboarding-provider-values";
import {
  type ConnectedProviderMap,
  costPerCheckCentsFromUsd,
  type OnboardingConnectProviderInput,
  providerOptions,
} from "./steps/StepConnectProvider.fields";
import { useOnboardingSources } from "./use-onboarding-sources";
// biome-ignore format: Compact initial props keep this production component within its line limit.
export function OnboardingWizard({ actions, costPerCheckCents, dataResidencyMessage,
  gscJustConnected,
  gscGoogleOAuth,
  gscOAuthConfigured,
  gscPropertyLabel,
  hasAnalyticsSource, hasOtherAnalyticsSource,
  initialFlowState,
  initialLocationSelections,
  initialKeywordCount, initialKeywordText, initialKeywordDraft, initialFirstCheckCandidates,
  initialProject,
  initialWebsite,
  initialSerpConnections,
  initialStep,
  monthlyCapCents,
  nextCheckAt,
  providerConnected,
  rankedKeywordConnections = [],
}: Readonly<OnboardingWizardProps>) {
  const sources = useOnboardingSources({ gscJustConnected, gscGoogleOAuth, gscPropertyLabel, hasAnalyticsSource, hasOtherAnalyticsSource, rankedKeywordConnections });
  const startingFlowState = {
    ...initialFlowState,
    projectId: projectIdFor(initialProject, initialFlowState),
  };
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [project, setProject] = useState(initialProject);
  const [flowState, setFlowState] = useState<OnboardingFlowState>(startingFlowState);
  const initialDraft = initialOnboardingDraft(initialProject, startingFlowState, initialWebsite, initialLocationSelections, initialKeywordDraft);
  const [draft, setDraft] = useState(() => initialDraft);
  const [keywordCount, setKeywordCount] = useState(initialKeywordCount);
  const [keywordsSaving, setKeywordsSaving] = useState(false);
  const [firstCheckCandidates, setFirstCheckCandidates] = useState(initialFirstCheckCandidates);
  const [authoritativeNextCheckAt, setAuthoritativeNextCheckAt] = useState(nextCheckAt);
  const [hasConnectedProvider, setHasConnectedProvider] = useState(providerConnected);
  const [serpConnections, setSerpConnections] = useState<ConnectedProviderMap>(
    initialSerpConnections ?? {},
  );
  const [maxReachableStep, setMaxReachableStep] = useState(initialStep);
  const [providerContinueDisabled, setProviderContinueDisabled] = useState(
    !providerConnected && !sources.hasAnalyticsSource,
  );
  const [keywordsContinueDisabled, setKeywordsContinueDisabled] = useState(
    initialDraft.addKeywords.locations.length === 0,
  );
  const [projectedCostPerCheckCents, setProjectedCostPerCheckCents] = useState(costPerCheckCents);
  const [inlineWarning, setInlineWarning] = useState<string | null>(null);
  const requestedProviderId = providerOptions.find(
    ({ value }) => value === flowState.providerId,
  )?.value;
  const savedProviderId = providerOptions.find(({ value }) => serpConnections[value])?.value;
  const connectedProviderId =
    requestedProviderId && (serpConnections[requestedProviderId] || savedProviderId === undefined)
      ? requestedProviderId
      : savedProviderId;
  const providerReady = hasConnectedProvider || connectedProviderId !== undefined;
  function currentProviderValues() {
    return readCurrentProviderValues(draft.connectProvider, flowState.projectId);
  }
  function replaceStep(step: OnboardingStepNumber, nextFlowState: OnboardingFlowState) {
    setInlineWarning(null);
    setCurrentStep(step);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", buildOnboardingStepHref(step, nextFlowState));
    }
  }
  function goToStep(step: OnboardingStepNumber, nextFlowState = flowState) {
    if (keywordsSaving || step > currentStep || step > maxReachableStep) {
      return;
    }
    replaceStep(step, nextFlowState);
  }
  function updateFlowAndStep(step: OnboardingStepNumber, nextFlowState: OnboardingFlowState) {
    setFlowState(nextFlowState);
    setMaxReachableStep((current) => Math.max(step, current) as OnboardingStepNumber);
    replaceStep(step, nextFlowState);
  }
  function mergeProjectId(projectId: string) {
    setDraft((current) => ({
      ...current,
      addKeywords: { ...current.addKeywords, projectId },
      connectProvider: { ...current.connectProvider, projectId },
      schedule: { ...current.schedule, projectId },
    }));
  }
  const handleCreateProjectComplete: OnboardingWizardStepsProps["onCreateProjectComplete"] = (
    values,
    nextProject,
    completion,
  ) => {
    const nextFlowState = { ...flowState, projectId: nextProject.publicId };
    if (project && nextProject.domain !== project.domain) sources.invalidateGsc();
    setProject(nextProject);
    setDraft((current) => ({
      ...current,
      createProject: values,
      schedule: {
        ...current.schedule,
        timezone: nextProject.timezone ?? current.schedule.timezone,
      },
    }));
    mergeProjectId(nextProject.publicId);
    updateFlowAndStep(2, nextFlowState);
    setInlineWarning(completion?.warning ?? null);
  };
  const handleProviderComplete: OnboardingWizardStepsProps["onProviderComplete"] = (
    values,
    nextConnections,
  ) => {
    setDraft((current) => ({ ...current, connectProvider: values }));
    setHasConnectedProvider(true);
    setSerpConnections(nextConnections);
    setProjectedCostPerCheckCents(costPerCheckCentsFromUsd(values.costPerCheck));
    updateFlowAndStep(3, { ...flowState, providerId: values.providerId });
  };
  const handleInlineProviderComplete: OnboardingWizardStepsProps["onInlineProviderComplete"] = (
    values,
    nextConnections,
  ) => {
    setDraft((current) => ({ ...current, connectProvider: values }));
    setHasConnectedProvider(true);
    setSerpConnections(nextConnections);
    setProjectedCostPerCheckCents(costPerCheckCentsFromUsd(values.costPerCheck));
    setFlowState((current) => ({ ...current, providerId: values.providerId }));
  };
  const handleProviderSkip = (values: OnboardingConnectProviderInput) => {
    setDraft((current) => ({ ...current, connectProvider: values }));
    setHasConnectedProvider(false);
    setProjectedCostPerCheckCents(null);
    updateFlowAndStep(3, { ...flowState, providerId: null });
  };
  const handleKeywordsSkip = () => {
    setKeywordCount(0);
    setFirstCheckCandidates([]);
    // biome-ignore format: keep skip payload on one line
    updateFlowAndStep(4, { ...flowState, devices: draft.addKeywords.devices, locations: draft.addKeywords.locations, projectId: draft.addKeywords.projectId });
  };
  function continueWithConnectedDataSource() {
    handleProviderSkip(currentProviderValues());
  }
  const handleKeywordsComplete: OnboardingWizardStepsProps["onKeywordsComplete"] = async (
    values,
    defaults,
    nextKeywordCount,
    warning,
  ) => {
    setDraft((current) => ({ ...current, addKeywords: values, schedule: defaults }));
    setKeywordCount(nextKeywordCount);
    const { candidates } = await actions.listFirstCheckCandidatesAction({
      projectId: values.projectId,
      keywordText: keywordLines(values.keywords)[0],
      includeExisting: true,
      limit: Math.max(1, values.locations.length * values.devices.length),
    });
    setFirstCheckCandidates(candidates);
    updateFlowAndStep(4, {
      ...flowState,
      devices: values.devices,
      locations: values.locations,
      projectId: values.projectId,
    });
    setInlineWarning(warning ?? null);
    if (sources.hasAnalyticsSource) {
      void actions.syncProjectTrafficAction({ projectId: values.projectId }).catch(() => {
        setInlineWarning(
          "Search Console sync didn't finish - observed data may take a moment. You can retry from Integrations.",
        );
      });
    }
  };
  const handleKeywordsChange: OnboardingWizardStepsProps["onKeywordsChange"] = (keywords) => {
    setFirstCheckCandidates(undefined);
    setDraft((current) => ({
      ...current,
      addKeywords: { ...current.addKeywords, keywords },
    }));
  };
  const handleMarketsChange: OnboardingWizardStepsProps["onMarketsChange"] = (selections) => {
    setFirstCheckCandidates(undefined);
    const locations = selections.map((selection) => selection.canonicalKey);
    setKeywordsContinueDisabled(locations.length === 0);
    setDraft((current) => ({
      ...current,
      addKeywords: { ...current.addKeywords, locations },
      schedule: { ...current.schedule, locationSelections: [...selections], locations },
    }));
  };
  async function handleTimezoneChange(timezone: string) {
    const defaults = { ...draft.schedule, timezone };
    setDraft((current) => ({ ...current, schedule: defaults }));
    const result = await actions.updateProjectDefaultsAction(defaults);
    setAuthoritativeNextCheckAt(result.nextCheckAt ?? null);
  }
  const providerStepContinueDisabled =
    currentStep === 2 && providerContinueDisabled && !sources.hasAnalyticsSource;
  const continueDisabled =
    providerStepContinueDisabled || (currentStep === 3 && keywordsContinueDisabled);
  const canContinueWithConnectedDataSource =
    currentStep === 2 &&
    !providerStepContinueDisabled &&
    sources.hasAnalyticsSource &&
    !hasConnectedProvider;
  return (
    <OnboardingStepper
      currentStep={currentStep}
      flowState={flowState}
      maxReachableStep={maxReachableStep}
      onStepChange={goToStep}
    >
      <section className="rounded-card border border-border bg-bg-elev p-6 sm:px-7 sm:py-[26px]">
        {inlineWarning ? (
          <p className={`m-0 mb-4 ${feedbackClass} text-yellow-text`}>{inlineWarning}</p>
        ) : null}
        <OnboardingWizardSteps
          actions={actions}
          currentStep={currentStep}
          dataResidencyMessage={dataResidencyMessage}
          draft={draft}
          flowState={flowState}
          gscJustConnected={sources.gscJustConnected}
          gscGoogleOAuth={sources.gscGoogleOAuth}
          gscOAuthConfigured={gscOAuthConfigured}
          gscPropertyLabel={sources.gscPropertyLabel}
          hasAnalyticsSource={sources.hasAnalyticsSource}
          hasConnectedProvider={providerReady}
          connectedProviderId={connectedProviderId}
          initialSerpConnections={serpConnections}
          initialKeywordText={initialKeywordText}
          initialFirstCheckCandidates={firstCheckCandidates}
          keywordCount={keywordCount}
          monthlyCapCents={monthlyCapCents}
          nextCheckAt={authoritativeNextCheckAt}
          onCreateProjectComplete={handleCreateProjectComplete}
          onKeywordsChange={handleKeywordsChange}
          onKeywordsSavingChange={setKeywordsSaving}
          onMarketsChange={handleMarketsChange}
          onKeywordsComplete={handleKeywordsComplete}
          onProviderComplete={handleProviderComplete}
          onInlineProviderComplete={handleInlineProviderComplete}
          onProviderContinueDisabledChange={setProviderContinueDisabled}
          onFirstCheckBack={() => goToStep(3)}
          onTimezoneChange={handleTimezoneChange}
          project={project}
          projectedCostPerCheckCents={projectedCostPerCheckCents}
          rankedKeywordConnections={sources.rankedKeywordConnections}
        />
        {currentStep !== 4 ? (
          <OnboardingNav
            busy={keywordsSaving}
            continueDisabled={continueDisabled}
            continueLabel={keywordsSaving ? "Saving keywords..." : "Continue"}
            currentStep={currentStep}
            flowState={flowState}
            leadingAction={
              currentStep === 1 ? (
                <OnboardingProjectOptions action={actions.installSampleDataAction} />
              ) : undefined
            }
            // biome-ignore format: Guarded compact handler keeps this component within its line limit.
            onBack={currentStep === 1 ? undefined : () => goToStep((currentStep - 1) as OnboardingStepNumber)}
            onContinue={
              canContinueWithConnectedDataSource ? continueWithConnectedDataSource : undefined
            }
            // biome-ignore format: keep skip action compact
            secondaryAction={<OnboardingWizardSkipAction currentStep={currentStep} flowState={flowState} getProviderValues={currentProviderValues} onKeywordsSkip={handleKeywordsSkip} onProviderSkip={handleProviderSkip} />}
          />
        ) : null}
      </section>
    </OnboardingStepper>
  );
}
