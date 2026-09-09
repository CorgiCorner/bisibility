import { type OnboardingStepNumber, onboardingSteps } from "./onboarding-fixtures";
import { WatchSetupVideoLink } from "./WatchSetupVideoLink";

const setupVideoRefByStep = {
  1: "create-project",
  2: "connect-source",
  3: "add-keywords",
  4: "first-check",
} as const;

type OnboardingWizardVideoActionProps = {
  currentStep: OnboardingStepNumber;
};

export function OnboardingWizardVideoAction({
  currentStep,
}: Readonly<OnboardingWizardVideoActionProps>) {
  return (
    <WatchSetupVideoLink
      step={currentStep}
      title={onboardingSteps[currentStep - 1]?.title ?? "Setup"}
      videoRef={setupVideoRefByStep[currentStep]}
    />
  );
}
