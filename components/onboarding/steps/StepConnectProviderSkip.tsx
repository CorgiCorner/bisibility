"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import { track } from "@/lib/analytics/client";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("onboarding.provider");
  const skipHref = buildOnboardingStepHref(3, {
    ...flowState,
    projectId: getValues().projectId,
  });
  function recordSkip() {
    track("onboarding_step_skipped", { reason: null, step: "connect_source" });
  }

  return (
    <OnboardingStepSkip
      ariaLabel={t("skip")}
      className="shrink-0"
      {...(onSkip
        ? {
            onClick: () => {
              recordSkip();
              onSkip(getValues());
            },
          }
        : { href: skipHref, onClick: recordSkip })}
    >
      {t("skipLabel")}
    </OnboardingStepSkip>
  );
}
