import { useTranslations } from "next-intl";
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
  const t = useTranslations("onboarding");
  return (
    <WatchSetupVideoLink
      step={currentStep}
      title={onboardingSteps(t)[currentStep - 1]?.title ?? t("video.fallbackTitle")}
      videoRef={setupVideoRefByStep[currentStep]}
    />
  );
}
