"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
} from "@/components/onboarding/onboarding-fixtures";
import Link from "next/link";
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
    <>
      <div className="mt-4 text-xs text-fg-muted">
        No provider yet?{" "}
        {onSkip ? (
          <button
            className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-accent-text hover:underline"
            onClick={() => onSkip(getValues())}
            type="button"
          >
            Skip, add keywords as paused
          </button>
        ) : (
          <Link className="font-semibold text-accent-text hover:underline" href={skipHref}>
            Skip, add keywords as paused
          </Link>
        )}
        .
      </div>
      <div className="mt-3 text-xs text-fg-muted">
        Search Console can be connected on the Add keywords step for a free owned-data path; GA4
        later under Integrations.
      </div>
    </>
  );
}
