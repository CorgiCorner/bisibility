"use client";

import type {
  OnboardingFlowState,
  OnboardingStepNumber,
} from "@/components/onboarding/onboarding-fixtures";
import { buildOnboardingStepHref } from "@/components/onboarding/onboarding-fixtures";
import Tooltip from "@mui/material/Tooltip";
import Link from "next/link";
import type { ReactNode } from "react";

type StepDotNavigationProps = {
  active: boolean;
  className: string;
  flowState?: OnboardingFlowState;
  icon: ReactNode;
  locked: boolean;
  onStepChange?: (step: OnboardingStepNumber) => void;
  step: OnboardingStepNumber;
  title: string;
};

export function StepDotNavigation({
  active,
  className,
  flowState,
  icon,
  locked,
  onStepChange,
  step,
  title,
}: Readonly<StepDotNavigationProps>) {
  if (onStepChange) {
    return (
      <Tooltip title={title}>
        <span className="inline-grid">
          <button
            aria-current={active ? "step" : undefined}
            aria-disabled={locked ? "true" : undefined}
            aria-label={title}
            className={className}
            disabled={locked}
            onClick={locked ? undefined : () => onStepChange(step)}
            type="button"
          >
            {icon}
          </button>
        </span>
      </Tooltip>
    );
  }
  if (locked)
    return (
      <Tooltip title={title}>
        <span
          aria-current={active ? "step" : undefined}
          aria-disabled="true"
          aria-label={title}
          className={className}
        >
          {icon}
        </span>
      </Tooltip>
    );
  return (
    <Tooltip title={title}>
      <Link
        aria-current={active ? "step" : undefined}
        aria-label={title}
        className={className}
        href={buildOnboardingStepHref(step, flowState)}
      >
        {icon}
      </Link>
    </Tooltip>
  );
}
