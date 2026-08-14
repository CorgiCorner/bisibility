"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
  type OnboardingStepNumber,
  onboardingSteps,
  totalOnboardingSteps,
} from "@/components/onboarding/onboarding-fixtures";
import { StepDotNavigation } from "@/components/onboarding/StepDotNavigation";
import { Button, type StepDotState, StepDots } from "@/components/ui";
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
  if (state === "current") return "bg-accent-solid text-primary-contrast";
  if (state === "past") return "bg-green-text text-accent-on-solid dark:text-bg";
  return "border border-border-strong bg-bg-sunken text-fg-muted";
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
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-fg-muted">
          Step {currentStep} of {totalOnboardingSteps}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-fg-muted">
          Project setup
        </span>
      </div>
      <div
        aria-label="Onboarding progress"
        aria-valuemax={totalOnboardingSteps}
        aria-valuemin={1}
        aria-valuenow={currentStep}
        className="mt-2 h-[5px] overflow-hidden rounded-[3px] bg-bg-sunken"
        role="progressbar"
      >
        <div
          className="h-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[248px_minmax(0,1fr)]">
        <div className="lg:hidden">
          <StepDots
            className="flex items-center justify-between gap-1.5"
            currentIndex={currentStep - 1}
            items={onboardingSteps}
            renderItem={({ item: step, state }) => (
              <StepDotItem
                flowState={flowState}
                maxReachableStep={maxReachableStep}
                onStepChange={onStepChange}
                state={state}
                step={step}
              />
            )}
          />
          <h2 className="m-0 mt-3.5 text-lg font-semibold tracking-[-0.4px]">{activeStep.title}</h2>
        </div>
        <nav aria-label="Onboarding steps" className="hidden flex-col gap-[3px] lg:flex">
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

function StepDotItem({
  flowState,
  maxReachableStep,
  onStepChange,
  state,
  step,
}: Readonly<{
  flowState?: OnboardingFlowState;
  maxReachableStep: OnboardingStepNumber;
  onStepChange?: (step: OnboardingStepNumber) => void;
  state: StepDotState;
  step: (typeof onboardingSteps)[number];
}>) {
  const locked = step.n > maxReachableStep;
  const done = !locked && state === "past";
  const active = state === "current";
  const className = cn(
    "grid h-[34px] w-[34px] place-items-center rounded-full p-0 text-sm",
    locked ? "cursor-default border-border bg-bg-sunken text-fg-muted" : "cursor-pointer",
    !locked && onboardingNavStepStateClass(state),
  );
  const icon = done ? (
    <Check aria-hidden size={15} weight="bold" />
  ) : (
    <span aria-hidden className="font-mono text-[12px] font-semibold">
      {step.n}
    </span>
  );
  return (
    <StepDotNavigation
      accessibleName={stepAccessibleName(step.title, done)}
      active={active}
      className={className}
      flowState={flowState}
      icon={icon}
      locked={locked}
      onStepChange={onStepChange}
      state={state}
      step={step.n}
      title={locked ? `${step.title} - complete the previous step first` : step.title}
    />
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
  const locked = step.n > maxReachableStep;
  const done = !locked && currentStep > step.n;
  const active = currentStep === step.n;
  const state: StepDotState = done ? "past" : active ? "current" : "upcoming";
  const status = done ? "Complete" : active ? "Current" : locked ? "Next" : "Next";

  const className = cn(
    "flex w-full items-center gap-3 rounded-[11px] border-0 bg-transparent px-3 py-[11px] text-left",
    locked ? "cursor-default" : "cursor-pointer hover:bg-nav-active",
    active && "border border-accent bg-nav-active",
  );
  const content = (
    <>
      <span
        className={cn(
          "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] text-[15px]",
          locked
            ? "border border-border bg-bg-sunken text-fg-muted"
            : onboardingNavStepStateClass(state),
        )}
        data-step-dot-state={state}
      >
        {done ? (
          <Check aria-hidden size={15} weight="bold" />
        ) : (
          <span aria-hidden className="font-mono text-[12px] font-semibold">
            {step.n}
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block text-[13px] leading-tight",
            active ? "font-semibold text-fg" : "font-medium text-fg-muted",
            done && !active && "text-fg-muted",
          )}
        >
          {step.title}
        </span>
        <span className="mt-0.5 block font-mono text-[10px] text-fg-muted">{step.desc}</span>
        <span
          className={cn(
            "mt-1 block text-[10.5px] leading-tight",
            active ? "font-medium text-accent-text" : "text-fg-muted",
          )}
        >
          {status}
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
          padding: "11px 12px",
          textAlign: "left",
          "&.Mui-disabled": { border: 0 },
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
