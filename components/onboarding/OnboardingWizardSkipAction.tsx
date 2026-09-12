import type {
  OnboardingFlowState,
  OnboardingStepNumber,
} from "@/components/onboarding/onboarding-fixtures";
import { StepAddKeywordsSkip } from "@/components/onboarding/steps/StepAddKeywordsSkip";
import type { OnboardingConnectProviderInput } from "@/components/onboarding/steps/StepConnectProvider.fields";
import { StepConnectProviderSkip } from "@/components/onboarding/steps/StepConnectProviderSkip";

type OnboardingWizardSkipActionProps = {
  currentStep: OnboardingStepNumber;
  flowState: OnboardingFlowState;
  getProviderValues: () => OnboardingConnectProviderInput;
  onKeywordsSkip: () => void;
  onProviderSkip: (values: OnboardingConnectProviderInput) => void;
};

export function OnboardingWizardSkipAction({
  currentStep,
  flowState,
  getProviderValues,
  onKeywordsSkip,
  onProviderSkip,
}: Readonly<OnboardingWizardSkipActionProps>) {
  if (currentStep === 2) {
    return (
      <StepConnectProviderSkip
        flowState={flowState}
        getValues={getProviderValues}
        onSkip={onProviderSkip}
      />
    );
  }
  if (currentStep === 3) {
    return <StepAddKeywordsSkip flowState={flowState} onSkip={onKeywordsSkip} />;
  }
  return null;
}
