import "server-only";
import type { StoredSchedule } from "@/lib/actions/_schedule";
import { assertCadenceReviewNotRequired } from "@/lib/api/keyword-cadence-review";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import type { KeywordCreateChange } from "@/lib/schemas/keyword-create-review";
import { ScheduleReviewRequiredError, ScheduleReviewStaleError } from "./errors";
import type { ScheduleReviewPrincipal } from "./review-binding";
import { commitReviewedScheduleWrite, type ScheduleReviewSubmission } from "./review-commit";
import { assessScheduleSpend } from "./review-decision";
import { loadCreateKeywords } from "./review-load-create-keywords";
import { withWebScheduleReview } from "./web-review";

// Transaction-bound admission cannot be supplied by a browser or reused on another client.
export type KeywordCreateReview = Readonly<{ projectId: string }>;
const admissions = new WeakMap<
  KeywordCreateReview,
  { tx: Prisma.TransactionClient; change: KeywordCreateChange; reviewed: boolean }
>();

export async function commitKeywordCreate<T>(
  projectId: string,
  actor: ScheduleReviewPrincipal,
  change: KeywordCreateChange,
  review: ScheduleReviewSubmission | undefined,
  run: (tx: Prisma.TransactionClient, review?: KeywordCreateReview) => Promise<T>,
  options?: { strictReview?: boolean },
) {
  if (
    !options?.strictReview &&
    !change.source &&
    !change.scheduleId &&
    (!change.cadence || ["manual", "paused"].includes(change.cadence.frequency)) &&
    !change.keywords.some(
      (row) => row.cadence && !["manual", "paused"].includes(row.cadence.frequency),
    )
  )
    return prisma.$transaction(run);
  return withWebScheduleReview(projectId, actor, change, () =>
    commitReviewedScheduleWrite({
      projectId,
      actor,
      change,
      options: {
        gate: true,
        review,
        rejectStaleToken: options?.strictReview,
        ...(change.source
          ? {
              db: {
                $transaction: (callback, options) =>
                  prisma.$transaction(callback, { ...options, isolationLevel: "Serializable" }),
              },
            }
          : {}),
      },
      run: async (_consent, reviewedTx) => {
        const execute = async (tx: Prisma.TransactionClient) => {
          await lockProjectForProviderMutation(tx, projectId);
          const loaded = await loadCreateKeywords(tx, projectId, change, new Date());
          // A no-review result must still be checked under the same project lock as creation.
          if (!reviewedTx) {
            if (assessScheduleSpend(loaded.spend).requires_review)
              throw new ScheduleReviewRequiredError();
          }
          const admission = Object.freeze({ projectId });
          admissions.set(admission, { tx, change: loaded.bindingChange, reviewed: !!reviewedTx });
          try {
            return await run(tx, admission);
          } finally {
            admissions.delete(admission);
          }
        };
        return reviewedTx
          ? execute(reviewedTx)
          : prisma.$transaction(execute, change.source ? { isolationLevel: "Serializable" } : {});
      },
    }),
  );
}

/** Every recurring low-level assignment must belong to the admitted create or prove no increase. */
export async function assertKeywordCreateAdmission(
  tx: Prisma.TransactionClient,
  projectId: string,
  ids: readonly string[],
  target: StoredSchedule & { publicId?: string },
  review?: KeywordCreateReview,
) {
  if (!ids.length || target.frequency === "manual" || target.frequency === "paused") return;
  const admission = review && admissions.get(review);
  if (review?.projectId === projectId && admission?.tx === tx) {
    const change = admission.change;
    const matchesCadence = (cadence: KeywordCreateChange["cadence"]) =>
      cadence &&
      (["frequency", "cronExpression", "jitterMinutes", "timezone", "serpDepth"] as const).every(
        (key) => cadence[key] === target[key],
      );
    const matching = change.keywords.filter((row) =>
      change.scheduleId
        ? change.scheduleId === target.publicId
        : matchesCadence(row.cadence === undefined ? change.cadence : row.cadence),
    );
    if (matching.length) {
      const rows = await tx.keyword.findMany({
        where: { id: { in: [...ids] }, projectId },
        select: {
          id: true,
          text: true,
          device: true,
          locationId: true,
          locationRef: { select: { canonicalKey: true } },
        },
      });
      const allowed = new Set(
        matching.map((row) => JSON.stringify([row.keyword, row.locationKey, row.device])),
      );
      if (
        rows.length === new Set(ids).size &&
        rows.every((row) =>
          allowed.has(JSON.stringify([row.text, row.locationRef.canonicalKey, row.device])),
        )
      )
        return;
      throw new ScheduleReviewStaleError("preview_mismatch");
    }
    throw new ScheduleReviewStaleError("preview_mismatch");
  }
  await assertCadenceReviewNotRequired(tx, projectId, ids, target);
}

export function keywordCreateIsReviewed(
  tx: Prisma.TransactionClient,
  review?: KeywordCreateReview,
) {
  const admission = review && admissions.get(review);
  return admission?.tx === tx && admission.reviewed;
}
