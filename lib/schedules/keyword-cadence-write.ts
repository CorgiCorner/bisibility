import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { settingsHash } from "@/lib/measurement-settings/host/hash";
import type { ScheduleReviewPrincipal } from "./review-binding";
import { commitReviewedScheduleWrite, type ScheduleReviewSubmission } from "./review-commit";
import type { ScheduleChange } from "./review-load";

type Change = Extract<ScheduleChange, { op: "keyword-cadence" }>;
export type ReviewedKeywordCadence = Readonly<{ projectId: string }>;
const allowed = new WeakMap<
  ReviewedKeywordCadence,
  { tx: Prisma.TransactionClient; change: Change }
>();

export function isReviewedKeywordCadence(
  admission: ReviewedKeywordCadence | undefined,
  tx: Prisma.TransactionClient,
  projectId: string,
  ids: readonly string[],
  cadence: Change["cadence"],
  source: Change["source"],
) {
  if (!admission || admission.projectId !== projectId) return false;
  const grant = allowed.get(admission);
  return Boolean(
    grant &&
      grant.tx === tx &&
      grant.change.source === source &&
      settingsHash("keyword-cadence", grant.change.cadence) ===
        settingsHash("keyword-cadence", cadence) &&
      ids.every((id) => grant.change.keywordIds.includes(id)),
  );
}

export function commitKeywordCadence<T>(
  projectId: string,
  actor: ScheduleReviewPrincipal,
  change: Change,
  review: ScheduleReviewSubmission | undefined,
  run: (tx: Prisma.TransactionClient, admission?: ReviewedKeywordCadence) => Promise<T>,
) {
  return commitReviewedScheduleWrite({
    projectId,
    actor,
    change,
    options: { atomic: true, gate: true, review },
    run: async (_consent, tx) => {
      if (!tx) throw new Error("Keyword cadence changes require a transaction.");
      if (!review) return run(tx);
      const admission = Object.freeze({ projectId });
      allowed.set(admission, { tx, change });
      try {
        return await run(tx, admission);
      } finally {
        allowed.delete(admission);
      }
    },
  });
}
