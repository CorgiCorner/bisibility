"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import { OnboardingStepSkip } from "./OnboardingStepSkip";
import type { OnboardingConnectProviderInput } from "./StepConnectProvider.fields";

type StepConnectProviderSkipProps = {
  flowState?: OnboardingFlowState;
  getValues: () => OnboardingConnectProviderInput;
  onSkip?: (values: OnboardingConnectProviderInput) => void;
};

export function StepConnectProviderSkip({
  flowState,
  getValues,
  onSkip,
}: Readonly<StepConnectProviderSkipProps>) {
  const skipHref = buildOnboardingStepHref(3, {
    ...flowState,
    projectId: getValues().projectId,
  });

  return (
    <OnboardingStepSkip
      ariaLabel="Skip provider connection and add keywords as paused"
      className="shrink-0"
      {...(onSkip ? { onClick: () => onSkip(getValues()) } : { href: skipHref })}
    >
      Skip
    </OnboardingStepSkip>
  );
}
