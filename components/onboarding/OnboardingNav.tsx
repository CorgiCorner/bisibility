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
import Link from "next/link";
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
        startIcon={<ArrowLeft aria-hidden size={15} weight="bold" />}
        sx={{ color: "var(--fg-muted)" }}
        type="button"
        variant="secondary"
      >
        Back
      </Button>
    );
  } else if (currentStep > 1) {
    backAction = (
      <Link
        className="inline-flex min-h-11 items-center gap-[7px] rounded-[10px] border border-border-strong bg-bg-elev px-[18px] py-2.5 text-[14.5px] font-semibold text-fg-muted"
        href={buildOnboardingStepHref(previousStep, flowState)}
      >
        <ArrowLeft aria-hidden size={15} weight="bold" /> Back
      </Link>
    );
  }

  return (
    <footer className="mt-7 flex items-center justify-between gap-3 border-border border-t pt-5">
      {backAction}
      <div className="flex items-center gap-3">
        {secondaryAction}
        <Button
          disabled={continueDisabled}
          endIcon={<ArrowRight aria-hidden size={15} weight="bold" />}
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
