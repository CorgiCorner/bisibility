import { useScheduleSpendReview } from "@/components/schedules/useScheduleSpendReview";
import type { MarketsPageRow } from "@/lib/markets/page-model";
import {
  type ScheduleActionFailure,
  unwrapScheduleActionResult,
} from "@/lib/schedules/action-result";
import type { ScheduleReviewSubmission } from "@/lib/schedules/review-commit";

type MarketInput = { marketId: string; projectId: string; review?: ScheduleReviewSubmission };
export type ReviewedMarketActions = {
  onRestore: (input: MarketInput) => Promise<unknown>;
  onStatusChange: (
    input: MarketInput & { enabled: boolean },
  ) => Promise<{ status: string } | ScheduleActionFailure>;
};

export function useMarketSpendReview({
  projectId,
  onRestore,
  onStatusChange,
  onRestored,
}: ReviewedMarketActions & { projectId: string; onRestored: () => void }) {
  const spendReview = useScheduleSpendReview(projectId);
  async function restore(market: MarketsPageRow) {
    await spendReview.run(
      { op: "market-reactivate", marketIds: [market.id], mode: "restore" },
      (review) => onRestore({ marketId: market.id, projectId, ...(review ? { review } : {}) }),
    );
    onRestored();
  }
  async function statusChange(input: { enabled: boolean; marketId: string }) {
    if (!input.enabled)
      return unwrapScheduleActionResult(await onStatusChange({ ...input, projectId }));
    return spendReview.run<{ status: string }>(
      { op: "market-reactivate", marketIds: [input.marketId], mode: "resume" },
      async (review) =>
        unwrapScheduleActionResult(
          await onStatusChange({ ...input, projectId, ...(review ? { review } : {}) }),
        ),
    );
  }
  return { restore, statusChange, dialog: spendReview.dialog };
}
