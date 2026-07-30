import { CheckIcon as Check } from "@phosphor-icons/react/dist/ssr";

export type SetupStep = "account" | "done" | "verify";

const steps: SetupStep[] = ["account", "verify", "done"];

export function SetupStepper({ current }: Readonly<{ current: SetupStep }>) {
  const currentIndex = steps.indexOf(current);

  return (
    <div className="flex items-center gap-2" aria-label="Setup progress">
      {steps.map((step, index) => {
        const state =
          index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";

        return (
          <div className="contents" key={step}>
            <span
              aria-current={state === "current" ? "step" : undefined}
              className={
                state === "current"
                  ? "grid h-6 w-6 place-items-center rounded-full bg-accent font-mono text-[11px] font-semibold text-white"
                  : "grid h-6 w-6 place-items-center rounded-full bg-bg-sunken font-mono text-[11px] font-semibold text-fg-muted"
              }
              data-step-state={state}
            >
              {state === "complete" ? (
                <Check aria-hidden className="text-fg-faint" size={12} weight="bold" />
              ) : (
                index + 1
              )}
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden
                className={`h-0.5 w-[26px] rounded-sm ${
                  index < currentIndex ? "bg-border-strong" : "bg-border"
                }`}
              />
            ) : null}
          </div>
        );
      })}
      <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.09em] text-fg-muted">
        Instance setup
      </span>
    </div>
  );
}
