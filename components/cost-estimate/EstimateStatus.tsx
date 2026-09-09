import { Button } from "@/components/ui/Button";
import type { CostEstimateState } from "./useCostEstimate";

export function EstimateStatus({ state }: Readonly<{ state: CostEstimateState }>) {
  return (
    <div className="flex min-h-10 items-center gap-3 text-sm text-fg-muted" role="status">
      {state.status === "error" ? (
        <>
          <span>Estimate unavailable.</span>
          <Button onClick={state.retry} size="sm" type="button" variant="secondary">
            Retry
          </Button>
        </>
      ) : (
        "Updating estimate…"
      )}
    </div>
  );
}
