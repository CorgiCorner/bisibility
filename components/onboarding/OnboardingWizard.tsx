"use client";

import { CloudImportWorkspaceButton } from "@/components/onboarding/CloudImportWorkspaceButton";
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
import { feedbackClass } from "@/components/onboarding/onboarding-form-utils";
import { locationValuesForKeys } from "@/components/onboarding/onboarding-location-field";
import {
  initialOnboardingDraft,
  initialReachableOnboardingStep,
  projectIdFor,
} from "@/components/onboarding/onboarding-wizard-state";
import { SampleDataButton } from "@/components/sample-data/SampleDataButton";
import { useState } from "react";
import { readCurrentProviderValues } from "./onboarding-provider-values";
import {
  type ConnectedProviderMap,
  costPerCheckCentsFromUsd,
  providerOptions,
} from "./steps/StepConnectProvider.fields";

export function OnboardingWizard({
  actions,
  costPerCheckCents,
  dataResidencyMessage,
  gscJustConnected,
  gscGoogleOAuth,
  gscOAuthConfigured,
  gscPropertyLabel,
  hasAnalyticsSource,
  initialFlowState,
  initialKeywordCount,
  initialProject,
  initialSerpConnections,
  initialStep,
  isCloud = false,
  monthlyCapCents,
  providerConnected,
  rankedKeywordConnections = [],
}: Readonly<OnboardingWizardProps>) {
  const startingFlowState = {
    ...initialFlowState,
    projectId: projectIdFor(initialProject, initialFlowState),
  };
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [project, setProject] = useState(initialProject);
  const [flowState, setFlowState] = useState<OnboardingFlowState>(startingFlowState);
  const [draft, setDraft] = useState(() =>
    initialOnboardingDraft(initialProject, startingFlowState),
  );
  const [keywordCount, setKeywordCount] = useState(initialKeywordCount);
  const [hasConnectedProvider, setHasConnectedProvider] = useState(providerConnected);
  const [serpConnections, setSerpConnections] = useState<ConnectedProviderMap>(
    initialSerpConnections ?? {},
  );
  const [maxReachableStep, setMaxReachableStep] = useState(() =>
    initialReachableOnboardingStep(initialStep, initialFlowState),
  );
  const [providerContinueDisabled, setProviderContinueDisabled] = useState(
    !providerConnected && !hasAnalyticsSource,
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
    if (step > maxReachableStep) {
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

  const previousStep = Math.max(1, currentStep - 1) as OnboardingStepNumber;
  const handleCreateProjectComplete: OnboardingWizardStepsProps["onCreateProjectComplete"] = (
    values,
    nextProject,
    completion,
  ) => {
    const nextFlowState = { ...flowState, projectId: nextProject.publicId };
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
  const handleProviderSkip: OnboardingWizardStepsProps["onProviderSkip"] = (values) => {
    setDraft((current) => ({ ...current, connectProvider: values }));
    setHasConnectedProvider(false);
    setProjectedCostPerCheckCents(null);
    updateFlowAndStep(3, { ...flowState, providerId: null });
  };
  function continueWithConnectedDataSource() {
    handleProviderSkip(currentProviderValues());
  }
  const handleKeywordsComplete: OnboardingWizardStepsProps["onKeywordsComplete"] = (
    values,
    defaults,
    nextKeywordCount,
    warning,
  ) => {
    setDraft((current) => ({ ...current, addKeywords: values, schedule: defaults }));
    setKeywordCount(nextKeywordCount);
    updateFlowAndStep(4, {
      ...flowState,
      devices: values.devices,
      locations: values.locations,
      projectId: values.projectId,
    });
    setInlineWarning(warning ?? null);
    if (hasAnalyticsSource) {
      void actions.syncProjectTrafficAction({ projectId: values.projectId }).catch(() => {
        setInlineWarning(
          "Search Console sync didn't finish - observed data may take a moment. You can retry from Integrations.",
        );
      });
    }
  };
  const handleKeywordsChange: OnboardingWizardStepsProps["onKeywordsChange"] = (keywords) => {
    setDraft((current) => ({
      ...current,
      addKeywords: { ...current.addKeywords, keywords },
    }));
  };
  const handleMarketsChange: OnboardingWizardStepsProps["onMarketsChange"] = (locations) => {
    setDraft((current) => ({
      ...current,
      addKeywords: { ...current.addKeywords, locations },
      schedule: {
        ...current.schedule,
        locations,
        locationSelections: locationValuesForKeys(locations),
      },
    }));
  };
  async function handleTimezoneChange(timezone: string) {
    const defaults = { ...draft.schedule, timezone };
    setDraft((current) => ({ ...current, schedule: defaults }));
    await actions.updateProjectDefaultsAction(defaults);
  }
  const providerStepContinueDisabled =
    currentStep === 2 && providerContinueDisabled && !hasAnalyticsSource;
  // Connected providers must submit through their form; the analytics-only skip
  // path would clear provider state.
  const canContinueWithConnectedDataSource =
    currentStep === 2 &&
    !providerStepContinueDisabled &&
    hasAnalyticsSource &&
    !hasConnectedProvider;

  return (
    <OnboardingStepper
      currentStep={currentStep}
      flowState={flowState}
      maxReachableStep={maxReachableStep}
      onStepChange={goToStep}
    >
      <section className="rounded-2xl border border-border bg-bg-elev p-6 sm:px-7 sm:py-[26px]">
        {inlineWarning ? (
          <p className={`m-0 mb-4 ${feedbackClass} text-yellow-text`}>{inlineWarning}</p>
        ) : null}
        <OnboardingWizardSteps
          actions={actions}
          currentStep={currentStep}
          dataResidencyMessage={dataResidencyMessage}
          draft={draft}
          flowState={flowState}
          gscJustConnected={gscJustConnected}
          gscGoogleOAuth={gscGoogleOAuth}
          gscOAuthConfigured={gscOAuthConfigured}
          gscPropertyLabel={gscPropertyLabel}
          hasAnalyticsSource={hasAnalyticsSource}
          hasConnectedProvider={providerReady}
          connectedProviderId={connectedProviderId}
          initialSerpConnections={serpConnections}
          keywordCount={keywordCount}
          monthlyCapCents={monthlyCapCents}
          onCreateProjectComplete={handleCreateProjectComplete}
          onKeywordsChange={handleKeywordsChange}
          onMarketsChange={handleMarketsChange}
          onKeywordsComplete={handleKeywordsComplete}
          onProviderComplete={handleProviderComplete}
          onProviderContinueDisabledChange={setProviderContinueDisabled}
          onProviderSkip={handleProviderSkip}
          onFirstCheckBack={() => goToStep(3)}
          onTimezoneChange={handleTimezoneChange}
          project={project}
          projectedCostPerCheckCents={projectedCostPerCheckCents}
          rankedKeywordConnections={rankedKeywordConnections}
        />
        {currentStep !== 4 ? (
          <OnboardingNav
            continueDisabled={providerStepContinueDisabled}
            continueLabel="Continue"
            currentStep={currentStep}
            flowState={flowState}
            leadingAction={
              currentStep === 1 ? (
                <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
                  <SampleDataButton
                    action={actions.installSampleDataAction}
                    label="Load sample project"
                    size="small"
                    sx={{
                      color: "var(--fg-muted)",
                      fontWeight: 400,
                      paddingX: "8px",
                      textTransform: "none",
                      "&:hover": {
                        backgroundColor: "transparent",
                        color: "var(--accent-text)",
                      },
                    }}
                    variant="text"
                  />
                  {isCloud ? <CloudImportWorkspaceButton /> : null}
                </div>
              ) : undefined
            }
            onBack={currentStep === 1 ? undefined : () => goToStep(previousStep)}
            onContinue={
              canContinueWithConnectedDataSource ? continueWithConnectedDataSource : undefined
            }
          />
        ) : null}
      </section>
    </OnboardingStepper>
  );
}
