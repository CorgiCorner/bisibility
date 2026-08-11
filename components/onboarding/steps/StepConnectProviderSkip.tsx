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
  const skipHref = buildOnboardingStepHref(4, {
    ...flowState,
    projectId: getValues().projectId,
  });

  return (
    <OnboardingStepSkip
      ariaLabel="Skip provider connection and add keywords as paused"
      className="-my-2 inline-flex min-h-10 shrink-0 items-center px-2 text-[13px]"
      {...(onSkip ? { onClick: () => onSkip(getValues()) } : { href: skipHref })}
    >
      Skip
    </OnboardingStepSkip>
  );
}
