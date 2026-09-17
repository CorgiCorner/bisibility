"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import { track } from "@/lib/analytics/client";
import { useTranslations } from "next-intl";
import { OnboardingStepSkip } from "./OnboardingStepSkip";

type StepAddKeywordsSkipProps = {
  flowState?: OnboardingFlowState;
  onSkip?: () => void;
};

export function StepAddKeywordsSkip({ flowState, onSkip }: Readonly<StepAddKeywordsSkipProps>) {
  const t = useTranslations("onboarding.keywords");
  const skipHref = buildOnboardingStepHref(4, flowState);
  function recordSkip() {
    track("onboarding_step_skipped", { reason: null, step: "add_keywords" });
  }

  return (
    <OnboardingStepSkip
      ariaLabel={t("skip")}
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
      {t("skipLabel")}
    </OnboardingStepSkip>
  );
}
