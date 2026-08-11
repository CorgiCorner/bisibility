"use client";

import {
  buildOnboardingStepHref,
  type OnboardingFlowState,
  type OnboardingIconKey,
  type OnboardingStepNumber,
  onboardingSteps,
  totalOnboardingSteps,
} from "@/components/onboarding/onboarding-fixtures";
import { StepDotNavigation } from "@/components/onboarding/StepDotNavigation";
import { Button, type StepDotState, StepDots, stepDotStateClass } from "@/components/ui";
import { cn } from "@/lib/ui/cn";
import {
  CheckIcon as Check,
  DatabaseIcon as Database,
  FolderSimpleIcon as FolderSimple,
  GitBranchIcon as GitBranch,
  LightningIcon as Lightning,
  MagnifyingGlassIcon as MagnifyingGlass,
  SlidersHorizontalIcon as SlidersHorizontal,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";

type OnboardingStepperProps = {
  children: ReactNode;
  currentStep: OnboardingStepNumber;
  flowState?: OnboardingFlowState;
  maxReachableStep?: OnboardingStepNumber;
  onStepChange?: (step: OnboardingStepNumber) => void;
};

const stepIcons = {
  branch: GitBranch,
  database: Database,
  folder: FolderSimple,
  lightning: Lightning,
  search: MagnifyingGlass,
  sliders: SlidersHorizontal,
} satisfies Record<OnboardingIconKey, typeof FolderSimple>;

function stepAccessibleName(title: string, done: boolean) {
  return done ? `${title}, completed` : title;
}

export function OnboardingStepper({
  children,
  currentStep,
  flowState,
  maxReachableStep = currentStep,
  onStepChange,
}: Readonly<OnboardingStepperProps>) {
  const progress = ((currentStep - 1) / (totalOnboardingSteps - 1)) * 100;
  const activeStep = onboardingSteps[currentStep - 1];

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-fg-muted">
          Step {currentStep} of {totalOnboardingSteps}
        </span>
      </div>
      <div className="mt-2 h-[5px] overflow-hidden rounded-[3px] bg-bg-sunken">
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
  const Icon = done ? Check : stepIcons[step.icon];
  const className = cn(
    "grid h-[34px] w-[34px] place-items-center rounded-full p-0 text-sm",
    locked ? "cursor-default" : "cursor-pointer",
    stepDotStateClass(state),
  );
  const icon = <Icon aria-hidden size={15} weight={done ? "bold" : "fill"} />;
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
      title={step.title}
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
  const Icon = done ? Check : stepIcons[step.icon];

  const className = cn(
    "flex w-full items-center gap-3 rounded-[11px] border-0 bg-transparent px-3 py-[11px] text-left",
    locked ? "cursor-default" : "cursor-pointer hover:bg-nav-active",
    active && "bg-nav-active",
  );
  const content = (
    <>
      <span
        className={cn(
          "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] text-[15px]",
          stepDotStateClass(state),
        )}
        data-step-dot-state={state}
      >
        <Icon aria-hidden size={15} weight={done ? "bold" : "fill"} />
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
