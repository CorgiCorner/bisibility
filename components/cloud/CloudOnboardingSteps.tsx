import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { Fragment } from "react";

const steps = [
  { label: "Account", n: 1 },
  { label: "Start", n: 2 },
  { label: "Finish", n: 3 },
] as const;

type CloudOnboardingStepsProps = {
  /** Current onboarding step (1-based). Earlier steps render as complete. */
  currentStep: number;
};

function stepState(step: number, currentStep: number) {
  if (step < currentStep) return "complete";
  if (step === currentStep) return "current";
  return "upcoming";
}

/** Progress derives from server-resolved onboarding state, never hardcoded step styling. */
export function CloudOnboardingSteps({ currentStep }: Readonly<CloudOnboardingStepsProps>) {
  return (
    <div className="mt-6 flex items-center gap-2.5 font-mono text-[11px]">
      {steps.map((step) => (
        <Fragment key={step.n}>
          {step.n > 1 ? (
            <span
              aria-hidden
              className={`h-0.5 w-[18px] flex-none rounded-[1px] ${
                step.n <= currentStep ? "bg-accent" : "bg-border"
              }`}
            />
          ) : null}
          <StepLabel label={step.label} n={step.n} state={stepState(step.n, currentStep)} />
        </Fragment>
      ))}
    </div>
  );
}

function StepLabel({
  label,
  n,
  state,
}: Readonly<{
  label: string;
  n: number;
  state: "complete" | "current" | "upcoming";
}>) {
  if (state === "complete") {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-green">
        <CheckCircle aria-hidden size={14} weight="fill" />
        {label}
      </span>
    );
  }

  if (state === "current") {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-accent text-[9px] text-white">
          {n}
        </span>
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-fg-faint">
      <span className="grid h-4 w-4 place-items-center rounded-full border-[1.5px] border-border-strong text-[9px]">
        {n}
      </span>
      {label}
    </span>
  );
}
