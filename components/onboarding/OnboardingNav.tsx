"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
  type OnboardingStepNumber,
  totalOnboardingSteps,
} from "@/components/onboarding/onboarding-fixtures";
import { onboardingFormId } from "@/components/onboarding/onboarding-form-utils";
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
      <button
        className="inline-flex items-center gap-[7px] rounded-[9px] border border-border-strong bg-bg-elev px-4 py-2.5 text-[13px] font-semibold text-fg-muted"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft aria-hidden size={15} weight="bold" /> Back
      </button>
    );
  } else if (currentStep > 1) {
    backAction = (
      <Link
        className="inline-flex items-center gap-[7px] rounded-[9px] border border-border-strong bg-bg-elev px-4 py-2.5 text-[13px] font-semibold text-fg-muted"
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
        <button
          className="inline-flex items-center gap-2 rounded-[9px] border-0 bg-accent px-5 py-[11px] text-[13.5px] font-semibold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
          disabled={continueDisabled}
          form={onContinue ? undefined : onboardingFormId}
          onClick={onContinue}
          type={onContinue ? "button" : "submit"}
        >
          {label}
          <ArrowRight aria-hidden size={15} weight="bold" />
        </button>
      </div>
    </footer>
  );
}
