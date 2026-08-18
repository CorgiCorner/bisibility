"use client";

import type {
  OnboardingFlowState,
  OnboardingStepNumber,
} from "@/components/onboarding/onboarding-fixtures";
import { buildOnboardingStepHref } from "@/components/onboarding/onboarding-fixtures";
import { Button, type StepDotState, Tooltip } from "@/components/ui";
import Link from "next/link";
import type { ReactNode } from "react";

type StepDotNavigationProps = {
  accessibleName: string;
  active: boolean;
  className: string;
  flowState?: OnboardingFlowState;
  icon: ReactNode;
  locked: boolean;
  onStepChange?: (step: OnboardingStepNumber) => void;
  state: StepDotState;
  step: OnboardingStepNumber;
  title: string;
};

export function StepDotNavigation({
  accessibleName,
  active,
  className,
  flowState,
  icon,
  locked,
  onStepChange,
  state,
  step,
  title,
}: Readonly<StepDotNavigationProps>) {
  if (onStepChange) {
    return (
      <Tooltip content={title}>
        <span className="inline-grid">
          <Button
            aria-current={active ? "step" : undefined}
            aria-disabled={locked ? "true" : undefined}
            aria-label={accessibleName}
            className={className}
            data-step-dot-state={state}
            disabled={locked}
            onClick={locked ? undefined : () => onStepChange(step)}
            size="xs"
            sx={{
              height: 34,
              minHeight: 34,
              minWidth: 34,
              padding: 0,
              "&.Mui-disabled": { border: 0 },
            }}
            type="button"
            variant="ghost"
          >
            {icon}
          </Button>
        </span>
      </Tooltip>
    );
  }
  if (locked)
    return (
      <Tooltip content={title}>
        <span
          aria-current={active ? "step" : undefined}
          aria-disabled="true"
          aria-label={accessibleName}
          className={className}
          data-step-dot-state={state}
        >
          {icon}
        </span>
      </Tooltip>
    );
  return (
    <Tooltip content={title}>
      <Link
        aria-current={active ? "step" : undefined}
        aria-label={accessibleName}
        className={className}
        data-step-dot-state={state}
        href={buildOnboardingStepHref(step, flowState)}
      >
        {icon}
      </Link>
    </Tooltip>
  );
}
