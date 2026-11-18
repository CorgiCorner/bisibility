import "server-only";
import type { Actor } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { ScheduleReviewRequiredError } from "./errors";
import { commitReviewedScheduleWrite, type ScheduleReviewSubmission } from "./review-commit";
import { assessScheduleSpend } from "./review-decision";
import type { ScheduleChange } from "./review-load";
import { loadTransfer } from "./review-load-transfers";
import { withWebScheduleReview } from "./web-review";

export function commitMarketReactivation<T>(
  projectId: string,
  actor: Actor,
  change: Extract<ScheduleChange, { op: "market-reactivate" }>,
  review: ScheduleReviewSubmission | undefined,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return withWebScheduleReview(projectId, actor, change, () =>
    commitReviewedScheduleWrite({
      projectId,
      actor,
      change,
      options: {
        gate: true,
        review,
        db: {
          $transaction: (callback, options) =>
            prisma.$transaction(callback, { ...options, isolationLevel: "Serializable" }),
        },
      },
      run: async (_consent, reviewedTx) => {
        const execute = async (tx: Prisma.TransactionClient) => {
          await lockProjectForProviderMutation(tx, projectId);
          if (
            !reviewedTx &&
            assessScheduleSpend((await loadTransfer(tx, projectId, change, new Date())).spend)
              .requires_review
          )
            throw new ScheduleReviewRequiredError();
          return run(tx);
        };
        return reviewedTx
          ? execute(reviewedTx)
          : prisma.$transaction(execute, { isolationLevel: "Serializable" });
      },
    }),
  );
}
