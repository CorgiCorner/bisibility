import type { SetupCta, SetupStepState } from "@/lib/getting-started/setup-steps";
import { CircleNotchIcon as CircleNotch, ClockIcon as Clock } from "@phosphor-icons/react";
import { formatScheduledRun } from "./schedule-phrase";

type StepStateMetaProps = {
  id: string;
  now: Date;
  onCta: (cta: SetupCta) => void;
  state: SetupStepState;
};

export function StepStateMeta({ id, now, onCta, state }: Readonly<StepStateMetaProps>) {
  if (state.family === "waiting") {
    return (
      <span
        className="pointer-events-auto relative z-10 mt-1 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12px] leading-5 text-fg-muted"
        id={id}
      >
        <Clock aria-hidden className="shrink-0" size={14} weight="regular" />
        <span>{formatScheduledRun({ ...state.when, now })} - </span>
        {state.accelerate ? (
          <button
            className="shrink-0 rounded-control font-semibold text-accent-text underline decoration-border underline-offset-2 outline-none hover:decoration-accent-text focus-visible:ring-2 focus-visible:ring-border-control"
            onClick={() => {
              if (state.family === "waiting" && state.accelerate) onCta(state.accelerate);
            }}
            type="button"
          >
            {state.accelerate.label}
          </button>
        ) : null}
      </span>
    );
  }
  if (state.family === "running") {
    return (
      <span className="mt-1 flex items-center gap-1.5 text-[12px] leading-5 text-fg-muted" id={id}>
        <CircleNotch aria-hidden className="motion-safe:animate-spin" size={14} weight="regular" />
        Running - {state.progress.completed} of {state.progress.total} checked
      </span>
    );
  }
  if (state.family === "blocked") {
    return (
      <span className="mt-1 block text-[12px] leading-5 text-fg-muted" id={id}>
        {state.reason}
      </span>
    );
  }
  return null;
}
