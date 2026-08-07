"use client";

import { OnboardingNav } from "@/components/onboarding/OnboardingNav";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
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
import type { OnboardingWizardActions } from "@/components/onboarding/onboarding-wizard-actions";
import {
  initialOnboardingDraft,
  initialReachableOnboardingStep,
  type OnboardingProject,
  projectIdFor,
} from "@/components/onboarding/onboarding-wizard-state";
import { SampleDataButton } from "@/components/sample-data/SampleDataButton";
import type { GoogleOAuthSetup } from "@/lib/integrations/types";
import type { RankedKeywordConnection } from "@/lib/ranked-keywords/service";
import { useState } from "react";
import { readCurrentProviderValues } from "./onboarding-provider-values";
import {
  type ConnectedProviderMap,
  costPerCheckCentsFromUsd,
} from "./steps/StepConnectProvider.fields";

type OnboardingWizardProps = {
  actions: OnboardingWizardActions;
  costPerCheckCents: number | null;
  dataResidencyMessage: string;
  gscJustConnected: boolean;
  gscGoogleOAuth?: GoogleOAuthSetup | null;
  gscOAuthConfigured: boolean;
  gscPropertyLabel?: string | null;
  hasAnalyticsSource: boolean;
  initialHasApiKey: boolean;
  initialFlowState: OnboardingFlowState;
  initialKeywordCount: number;
  initialProject: OnboardingProject | null;
  initialSerpConnections?: ConnectedProviderMap;
  initialStep: OnboardingStepNumber;
  isCloud?: boolean;
  monthlyCapCents: number;
  providerConnected: boolean;
  rankedKeywordConnections?: RankedKeywordConnection[];
};

export function OnboardingWizard({
  actions,
  costPerCheckCents,
  dataResidencyMessage,
  gscJustConnected,
  gscGoogleOAuth,
  gscOAuthConfigured,
  gscPropertyLabel,
  hasAnalyticsSource,
  initialHasApiKey,
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
  const [hasApiKey, setHasApiKey] = useState(initialHasApiKey);
  const [hasConnectedProvider, setHasConnectedProvider] = useState(providerConnected);
  const [maxReachableStep, setMaxReachableStep] = useState(() =>
    initialReachableOnboardingStep(initialStep, initialFlowState),
  );
  const [providerContinueDisabled, setProviderContinueDisabled] = useState(
    !providerConnected && !hasAnalyticsSource,
  );
  const [projectedCostPerCheckCents, setProjectedCostPerCheckCents] = useState(costPerCheckCents);
  const [inlineWarning, setInlineWarning] = useState<string | null>(null);

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
    setDraft((current) => ({ ...current, createProject: values }));
    mergeProjectId(nextProject.publicId);
    updateFlowAndStep(2, nextFlowState);
    setInlineWarning(completion?.warning ?? null);
  };
  const handleDeveloperAccessComplete = () => updateFlowAndStep(3, flowState);
  const handleProviderComplete: OnboardingWizardStepsProps["onProviderComplete"] = (values) => {
    setDraft((current) => ({ ...current, connectProvider: values }));
    setHasConnectedProvider(true);
    setProjectedCostPerCheckCents(costPerCheckCentsFromUsd(values.costPerCheck));
    updateFlowAndStep(4, { ...flowState, providerId: values.providerId });
  };
  const handleProviderSkip: OnboardingWizardStepsProps["onProviderSkip"] = (values) => {
    setDraft((current) => ({ ...current, connectProvider: values }));
    setHasConnectedProvider(false);
    setProjectedCostPerCheckCents(null);
    updateFlowAndStep(4, { ...flowState, providerId: null });
  };
  function continueWithConnectedDataSource() {
    handleProviderSkip(currentProviderValues());
  }
  const handleScheduleComplete: OnboardingWizardStepsProps["onScheduleComplete"] = (values) => {
    setDraft((current) => ({
      ...current,
      addKeywords: {
        ...current.addKeywords,
        device: values.device,
        devices: values.devices,
        locations: values.locations,
      },
      schedule: values,
    }));
    updateFlowAndStep(5, {
      ...flowState,
      devices: values.devices,
      locations: values.locations,
      projectId: values.projectId,
    });
  };
  const handleKeywordsComplete: OnboardingWizardStepsProps["onKeywordsComplete"] = (
    values,
    createdCount,
    warning,
  ) => {
    setDraft((current) => ({ ...current, addKeywords: values }));
    setKeywordCount((current) => current + createdCount);
    updateFlowAndStep(6, {
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
  const providerStepContinueDisabled =
    currentStep === 3 && providerContinueDisabled && !hasAnalyticsSource;
  // Connected providers must submit through their form; the analytics-only skip
  // path would clear provider state.
  const canContinueWithConnectedDataSource =
    currentStep === 3 &&
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
          <p className={`m-0 mb-4 ${feedbackClass} text-yellow`}>{inlineWarning}</p>
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
          hasApiKey={hasApiKey}
          hasConnectedProvider={hasConnectedProvider}
          isCloud={isCloud}
          initialSerpConnections={initialSerpConnections}
          keywordCount={keywordCount}
          monthlyCapCents={monthlyCapCents}
          onCreateProjectComplete={handleCreateProjectComplete}
          onApiKeyIssued={() => setHasApiKey(true)}
          onDeveloperAccessComplete={handleDeveloperAccessComplete}
          onKeywordsChange={handleKeywordsChange}
          onKeywordsComplete={handleKeywordsComplete}
          onProviderComplete={handleProviderComplete}
          onProviderContinueDisabledChange={setProviderContinueDisabled}
          onProviderSkip={handleProviderSkip}
          onScheduleComplete={handleScheduleComplete}
          project={project}
          projectedCostPerCheckCents={projectedCostPerCheckCents}
          rankedKeywordConnections={rankedKeywordConnections}
        />
        <OnboardingNav
          continueDisabled={providerStepContinueDisabled}
          continueLabel={currentStep === 6 ? "Open dashboard" : "Continue"}
          currentStep={currentStep}
          flowState={flowState}
          leadingAction={
            currentStep === 1 ? (
              <SampleDataButton
                action={actions.installSampleDataAction}
                label="Load sample project"
                size="small"
                sx={{
                  color: "var(--fg-muted)",
                  fontWeight: 400,
                  paddingX: 0,
                  textTransform: "none",
                  "&:hover": { backgroundColor: "transparent", color: "var(--accent)" },
                }}
                variant="text"
              />
            ) : undefined
          }
          onBack={currentStep === 1 ? undefined : () => goToStep(previousStep)}
          onContinue={
            canContinueWithConnectedDataSource ? continueWithConnectedDataSource : undefined
          }
          secondaryAction={
            currentStep === 3 ? (
              <button
                className="cursor-pointer border-0 bg-transparent px-3 py-2.5 text-[13px] font-semibold text-fg-muted hover:text-accent"
                onClick={continueWithConnectedDataSource}
                type="button"
              >
                Skip
              </button>
            ) : undefined
          }
        />
      </section>
    </OnboardingStepper>
  );
}
