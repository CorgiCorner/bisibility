"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
  type OnboardingStepNumber,
} from "@/components/onboarding/onboarding-fixtures";
import type { OnboardingWizardActions } from "@/components/onboarding/onboarding-wizard-actions";
import type {
  OnboardingDraft,
  OnboardingProject,
} from "@/components/onboarding/onboarding-wizard-state";
import { StepAddKeywords } from "@/components/onboarding/steps/StepAddKeywords";
import { StepConnectGscCard } from "@/components/onboarding/steps/StepConnectGscCard";
import { StepConnectProvider } from "@/components/onboarding/steps/StepConnectProvider";
import type { ConnectedProviderMap } from "@/components/onboarding/steps/StepConnectProvider.fields";
import { StepCreateProject } from "@/components/onboarding/steps/StepCreateProject";
import { StepDeveloperAccess } from "@/components/onboarding/steps/StepDeveloperAccess";
import { StepFirstCheck } from "@/components/onboarding/steps/StepFirstCheck";
import { StepSchedule } from "@/components/onboarding/steps/StepSchedule";
import type { GoogleOAuthSetup } from "@/lib/integrations/types";
import type { RankedKeywordConnection } from "@/lib/ranked-keywords/service";

export type OnboardingWizardStepsProps = {
  actions: OnboardingWizardActions;
  currentStep: OnboardingStepNumber;
  dataResidencyMessage: string;
  draft: OnboardingDraft;
  flowState: OnboardingFlowState;
  gscJustConnected: boolean;
  gscGoogleOAuth?: GoogleOAuthSetup | null;
  gscOAuthConfigured: boolean;
  gscPropertyLabel?: string | null;
  hasAnalyticsSource: boolean;
  hasApiKey: boolean;
  hasConnectedProvider: boolean;
  isCloud: boolean;
  initialSerpConnections?: ConnectedProviderMap;
  keywordCount: number;
  monthlyCapCents: number;
  project: OnboardingProject | null;
  projectedCostPerCheckCents: number | null;
  rankedKeywordConnections: RankedKeywordConnection[];
  onCreateProjectComplete: NonNullable<Parameters<typeof StepCreateProject>[0]["onComplete"]>;
  onApiKeyIssued: () => void;
  onDeveloperAccessComplete: () => void;
  onKeywordsChange: NonNullable<Parameters<typeof StepAddKeywords>[0]["onKeywordsChange"]>;
  onKeywordsComplete: NonNullable<Parameters<typeof StepAddKeywords>[0]["onComplete"]>;
  onProviderComplete: NonNullable<Parameters<typeof StepConnectProvider>[0]["onComplete"]>;
  onProviderContinueDisabledChange: NonNullable<
    Parameters<typeof StepConnectProvider>[0]["onContinueDisabledChange"]
  >;
  onProviderSkip: NonNullable<Parameters<typeof StepConnectProvider>[0]["onSkip"]>;
  onScheduleComplete: NonNullable<Parameters<typeof StepSchedule>[0]["onComplete"]>;
};

export function OnboardingWizardSteps({
  actions,
  currentStep,
  dataResidencyMessage,
  draft,
  flowState,
  gscJustConnected,
  gscGoogleOAuth,
  gscOAuthConfigured,
  gscPropertyLabel,
  hasAnalyticsSource,
  hasApiKey,
  hasConnectedProvider,
  isCloud,
  initialSerpConnections,
  keywordCount,
  monthlyCapCents,
  project,
  projectedCostPerCheckCents,
  rankedKeywordConnections,
  onCreateProjectComplete,
  onApiKeyIssued,
  onDeveloperAccessComplete,
  onKeywordsChange,
  onKeywordsComplete,
  onProviderComplete,
  onProviderContinueDisabledChange,
  onProviderSkip,
  onScheduleComplete,
}: Readonly<OnboardingWizardStepsProps>) {
  return (
    <>
      {currentStep === 1 ? (
        <StepCreateProject
          createProjectAction={actions.createProjectAction}
          dataResidencyMessage={dataResidencyMessage}
          defaultValues={draft.createProject}
          flowState={flowState}
          initialProject={project}
          isCloud={isCloud}
          onComplete={onCreateProjectComplete}
          saveMatchingScopeAction={actions.saveMatchingScopeAction}
        />
      ) : null}
      {currentStep === 2 ? (
        <StepDeveloperAccess
          hasApiKey={hasApiKey}
          issueApiKeyAction={actions.issueApiKeyAction}
          onApiKeyIssued={onApiKeyIssued}
          onComplete={onDeveloperAccessComplete}
          projectId={project?.publicId ?? flowState.projectId}
        />
      ) : null}
      {currentStep === 3 ? (
        <StepConnectProvider
          connectProviderAction={actions.connectProviderAction}
          defaultValues={draft.connectProvider}
          flowState={flowState}
          initialConnections={initialSerpConnections}
          onComplete={onProviderComplete}
          onContinueDisabledChange={onProviderContinueDisabledChange}
          onSkip={onProviderSkip}
          testProviderConnectionAction={actions.testProviderConnectionAction}
        />
      ) : null}
      {currentStep === 4 ? (
        <StepSchedule
          defaultValues={draft.schedule}
          flowState={flowState}
          onComplete={onScheduleComplete}
          projectedCostPerCheckCents={projectedCostPerCheckCents}
          updateProjectDefaultsAction={actions.updateProjectDefaultsAction}
        />
      ) : null}
      {currentStep === 5 ? (
        <>
          <StepConnectGscCard
            completePropertySelection={actions.completeGooglePropertySelectionAction}
            configured={gscOAuthConfigured}
            connectedPropertyLabel={gscPropertyLabel}
            googleOAuth={gscGoogleOAuth}
            justConnected={gscJustConnected}
            projectId={project?.publicId ?? flowState.projectId}
            returnPath={buildOnboardingStepHref(5, flowState)}
          />
          <StepAddKeywords
            addKeywordsAction={actions.addKeywordsAction}
            awaitingPropertySelection={Boolean(gscGoogleOAuth)}
            costPerCheckCents={projectedCostPerCheckCents}
            defaultValues={draft.addKeywords}
            flowState={{
              ...flowState,
              cronExpression: draft.schedule.cronExpression,
              frequency: draft.schedule.frequency,
              serpDepth: draft.schedule.serpDepth,
            }}
            hasAnalyticsSource={hasAnalyticsSource}
            importTopQueriesAction={actions.importTopQueriesAction}
            fetchRankedKeywordSuggestionsAction={actions.fetchRankedKeywordSuggestionsAction}
            monthlyCapCents={monthlyCapCents}
            onComplete={onKeywordsComplete}
            onKeywordsChange={onKeywordsChange}
            projectDomain={project?.domain}
            rankedKeywordConnections={rankedKeywordConnections}
          />
        </>
      ) : null}
      {currentStep === 6 ? (
        <StepFirstCheck
          defaults={draft.schedule}
          flowState={flowState}
          getObservedPositionsAction={actions.getObservedPositionsAction}
          hasAnalyticsSource={hasAnalyticsSource}
          keywordCount={keywordCount}
          listFirstCheckCandidatesAction={actions.listFirstCheckCandidatesAction}
          project={project}
          providerConnected={hasConnectedProvider}
          queueFirstChecksAction={actions.queueFirstChecksAction}
          runFirstCheckPreviewAction={actions.runFirstCheckPreviewAction}
        />
      ) : null}
    </>
  );
}
