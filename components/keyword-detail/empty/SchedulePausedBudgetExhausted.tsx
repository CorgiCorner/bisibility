import {
  EmptyModuleCard,
  EmptyModuleLabel,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import { Button } from "@/components/ui";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/ssr";

export type SchedulePausedBudgetExhaustedProps = {
  pauseReason?: string;
};

export function SchedulePausedBudgetExhausted({
  pauseReason = "Paused - migration hold",
}: Readonly<SchedulePausedBudgetExhaustedProps>) {
  return (
    <EmptyModuleCard>
      <div className="flex flex-wrap items-center gap-3 rounded-[11px] border border-border-strong bg-bg-elev px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-1">
          <EmptyModuleLabel>Next check</EmptyModuleLabel>
          <span className="text-[13px] font-semibold text-fg">Paused</span>
          <span aria-hidden className="h-3 border-l border-border-strong" />
          <span className="font-mono text-[10.5px] text-fg-muted">{pauseReason}</span>
        </div>
        <Button disabled size="sm" type="button" variant="secondary">
          Run check
        </Button>
      </div>
      <div
        aria-label="Provider budget exhausted"
        className="mt-3 flex items-start gap-3 rounded-[11px] border border-border-strong bg-bg-elev px-4 py-3"
        data-persistent-inline-banner
        role="alert"
      >
        <WarningCircle
          aria-hidden
          className="mt-0.5 shrink-0 text-red-text"
          size={16}
          weight="fill"
        />
        <div>
          <p className="m-0 text-[13px] font-semibold text-fg">Monthly provider budget reached</p>
          <p className="m-0 mt-1 text-[12px] leading-[1.5] text-fg-muted">
            Cached data remains available while new checks are paused.
          </p>
        </div>
      </div>
    </EmptyModuleCard>
  );
}
