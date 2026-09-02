"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
  type OnboardingStepNumber,
  onboardingSteps,
  totalOnboardingSteps,
} from "@/components/onboarding/onboarding-fixtures";
import { Button, type StepDotState } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import { CheckIcon as Check } from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";

type OnboardingStepperProps = {
  children: ReactNode;
  currentStep: OnboardingStepNumber;
  flowState?: OnboardingFlowState;
  maxReachableStep?: OnboardingStepNumber;
  onStepChange?: (step: OnboardingStepNumber) => void;
};

function stepAccessibleName(title: string, done: boolean) {
  return done ? `${title}, completed` : title;
}

function onboardingNavStepStateClass(state: StepDotState) {
  if (state === "current") return "bg-accent-solid text-accent-on-solid";
  if (state === "past") return "bg-accent-soft text-accent-solid";
  return "border border-border bg-transparent text-fg-muted";
}

export function OnboardingStepper({
  children,
  currentStep,
  flowState,
  maxReachableStep = currentStep,
  onStepChange,
}: Readonly<OnboardingStepperProps>) {
  const progress = (currentStep / totalOnboardingSteps) * 100;
  const activeStep = onboardingSteps[currentStep - 1];

  return (
    <div className="mt-6">
      <span className="text-xs text-fg-muted tabular-nums">
        Step {currentStep} of {totalOnboardingSteps}
      </span>
      <div
        aria-label="Onboarding progress"
        aria-valuemax={totalOnboardingSteps}
        aria-valuemin={1}
        aria-valuenow={currentStep}
        className="mt-2 h-[5px] overflow-hidden rounded-control bg-bg-sunken"
        role="progressbar"
      >
        <div
          className="h-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
        <div className="lg:hidden">
          <h2 className="m-0 text-lg font-semibold tracking-[-0.4px]">{activeStep.title}</h2>
        </div>
        <nav aria-label="Onboarding steps" className="hidden flex-col gap-2 lg:flex">
          {onboardingSteps.map((step) => (
            <StepRailItem
              currentStep={currentStep}
              flowState={flowState}
              key={step.n}
              maxReachableStep={maxReachableStep}
              onStepChange={onStepChange}
              step={step}
            />
          ))}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

function StepRailItem({
  currentStep,
  flowState,
  maxReachableStep,
  onStepChange,
  step,
}: Readonly<{
  currentStep: OnboardingStepNumber;
  flowState?: OnboardingFlowState;
  maxReachableStep: OnboardingStepNumber;
  onStepChange?: (step: OnboardingStepNumber) => void;
  step: (typeof onboardingSteps)[number];
}>) {
  // Forward rail jumps skip the current step's Continue / Skip, including
  // required ones. Only completed steps (and the current one) stay clickable.
  const locked = step.n > currentStep || step.n > maxReachableStep;
  const done = !locked && currentStep > step.n;
  const active = currentStep === step.n;
  const state: StepDotState = done ? "past" : active ? "current" : "upcoming";

  const className = cn(
    "flex w-full items-center gap-3 rounded-control border border-transparent bg-transparent px-0 py-[11px] text-left",
    locked ? "cursor-default" : "cursor-pointer",
    active && "border-accent",
  );
  const content = (
    <>
      <span
        className={cn(
          "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-control text-[15px]",
          onboardingNavStepStateClass(state),
        )}
        data-step-dot-state={state}
      >
        {done ? (
          <Check aria-hidden size={15} weight="regular" />
        ) : (
          <span aria-hidden className="text-[12px] font-semibold tabular-nums">
            {step.n}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span
          className={cn(
            "block text-[13px] leading-tight",
            active ? "font-semibold text-fg" : "font-medium text-fg-muted",
            done && !active && "text-fg-muted",
          )}
        >
          {step.title}
        </span>
        <span className="block text-[10px] font-normal leading-snug text-fg-muted">
          {step.desc}
        </span>
      </span>
    </>
  );

  return (
    <StepRailNavigation
      accessibleName={stepAccessibleName(step.title, done)}
      active={active}
      className={className}
      content={content}
      flowState={flowState}
      locked={locked}
      onStepChange={onStepChange}
      step={step}
    />
  );
}

function StepRailNavigation({
  accessibleName,
  active,
  className,
  content,
  flowState,
  locked,
  onStepChange,
  step,
}: Readonly<{
  accessibleName: string;
  active: boolean;
  className: string;
  content: ReactNode;
  flowState?: OnboardingFlowState;
  locked: boolean;
  onStepChange?: (step: OnboardingStepNumber) => void;
  step: (typeof onboardingSteps)[number];
}>) {
  if (onStepChange) {
    return (
      <Button
        aria-current={active ? "step" : undefined}
        aria-disabled={locked ? "true" : undefined}
        aria-label={accessibleName}
        className={className}
        disabled={locked}
        onClick={locked ? undefined : () => onStepChange(step.n)}
        size="xs"
        sx={{
          justifyContent: "flex-start",
          minHeight: 0,
          padding: "11px 0",
          textAlign: "left",
          backgroundColor: "transparent",
          "&:hover": {
            backgroundColor: "transparent",
          },
          "&.Mui-disabled": {
            backgroundColor: "transparent",
            border: "1px solid transparent",
            color: "inherit",
          },
          "&.Mui-disabled:hover": { backgroundColor: "transparent" },
        }}
        type="button"
        variant="ghost"
      >
        {content}
      </Button>
    );
  }
  if (locked)
    return (
      <span
        aria-current={active ? "step" : undefined}
        aria-disabled="true"
        aria-label={accessibleName}
        className={className}
      >
        {content}
      </span>
    );
  return (
    <Link
      aria-current={active ? "step" : undefined}
      aria-label={accessibleName}
      className={className}
      href={buildOnboardingStepHref(step.n, flowState)}
    >
      {content}
    </Link>
  );
}
