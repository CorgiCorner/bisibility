"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
  type OnboardingStepNumber,
  totalOnboardingSteps,
} from "@/components/onboarding/onboarding-fixtures";
import { onboardingFormId } from "@/components/onboarding/onboarding-form-utils";
import { Button } from "@/components/ui";
import { ArrowLeftIcon as ArrowLeft, ArrowRightIcon as ArrowRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

type OnboardingNavProps = {
  continueDisabled?: boolean;
  continueLabel?: string;
  currentStep: OnboardingStepNumber;
  flowState?: OnboardingFlowState;
  /** Rendered in the left footer slot when the step has no Back button (step 1). */
  leadingAction?: ReactNode;
  onBack?: () => void;
  onContinue?: () => void;
  /** Rendered in the right footer group immediately before Continue. */
  secondaryAction?: ReactNode;
};

export function OnboardingNav({
  continueDisabled = false,
  continueLabel,
  currentStep,
  flowState,
  leadingAction,
  onBack,
  onContinue,
  secondaryAction,
}: Readonly<OnboardingNavProps>) {
  const previousStep = Math.max(1, currentStep - 1) as OnboardingStepNumber;
  const isLastStep = currentStep === totalOnboardingSteps;
  const label = continueLabel ?? (isLastStep ? "Open dashboard" : "Continue");
  let backAction: ReactNode = leadingAction ?? <span />;
  if (currentStep > 1 && onBack) {
    backAction = (
      <Button
        onClick={onBack}
        size="lg"
        startIcon={<ArrowLeft aria-hidden size={15} weight="regular" />}
        sx={{ color: "var(--fg-muted)" }}
        type="button"
        variant="secondary"
      >
        Back
      </Button>
    );
  } else if (currentStep > 1) {
    backAction = (
      <Button
        href={buildOnboardingStepHref(previousStep, flowState)}
        size="lg"
        startIcon={<ArrowLeft aria-hidden size={15} weight="regular" />}
        sx={{ color: "var(--fg-muted)" }}
        variant="secondary"
      >
        Back
      </Button>
    );
  }

  return (
    <footer className="-mx-6 mt-7 flex items-end justify-between gap-3 border-border border-t px-6 pt-5 sm:-mx-7 sm:px-7">
      {backAction}
      <div className="flex items-end gap-3">
        {secondaryAction}
        <Button
          disabled={continueDisabled}
          endIcon={<ArrowRight aria-hidden size={15} weight="regular" />}
          form={onContinue ? undefined : onboardingFormId}
          onClick={onContinue}
          size="lg"
          type={onContinue ? "button" : "submit"}
          variant="primary"
        >
          {label}
        </Button>
      </div>
    </footer>
  );
}
