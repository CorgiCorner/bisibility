"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import { track } from "@/lib/analytics/client";
import { OnboardingStepSkip } from "./OnboardingStepSkip";

type StepAddKeywordsSkipProps = {
  flowState?: OnboardingFlowState;
  onSkip?: () => void;
};

export function StepAddKeywordsSkip({ flowState, onSkip }: Readonly<StepAddKeywordsSkipProps>) {
  const skipHref = buildOnboardingStepHref(4, flowState);
  function recordSkip() {
    track("onboarding_step_skipped", { reason: null, step: "add_keywords" });
  }

  return (
    <OnboardingStepSkip
      ariaLabel="Skip adding keywords and open first check"
      className="shrink-0"
      {...(onSkip
        ? {
            onClick: () => {
              recordSkip();
              onSkip();
            },
          }
        : { href: skipHref, onClick: recordSkip })}
    >
      Skip for now
    </OnboardingStepSkip>
  );
}
