import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { resolveSerpDepth } from "@/lib/serp/constants";
import {
  nearTermCostIncreased,
  projectionCostIncreased,
  type ReviewCadence,
  rankUnitCents,
  reviewOccurrences,
} from "./review-cost";
import { calendarMissReason, weightsProveNoIncrease } from "./review-decision";

type KeywordCadence = {
  archivedAt: Date | null;
  cronExpression: string | null;
  enabled: boolean;
  frequency: ReviewCadence["frequency"];
  providerPolicy?: string | null;
  serpDepth: number | null;
};

function keywordWeight(
  cadence: KeywordCadence | null,
  depth: number,
  now: Date,
  projectDepth: number,
) {
  if (!cadence || cadence.archivedAt || !cadence.enabled) return 0;
  if (cadence.frequency === "manual" || cadence.frequency === "paused") return 0;
  const runs = reviewOccurrences(
    {
      archived: false,
      cronExpression: cadence.cronExpression,
      enabled: true,
      frequency: cadence.frequency,
      jitterMinutes: 0,
      publicId: "keyword-review",
      serpDepth: depth,
      timeOfDay: null,
      timezone: "UTC",
    },
    now,
  );
  if (runs === null) return null;
  return runs * pagesPerCheck(resolveSerpDepth(depth ?? projectDepth));
}

function sameKeywordCadence(
  current: KeywordCadence,
  target: KeywordCadence,
  depth: number,
  next: number,
) {
  return (
    current.frequency === target.frequency &&
    depth === next &&
    (target.frequency === "custom_cron"
      ? current.cronExpression === target.cronExpression
      : current.frequency !== "custom_cron")
  );
}

function keywordProjection(
  cadence: KeywordCadence | null,
  depth: number,
  policy: string | null,
  now: Date,
  projectDepth: number,
  projectProvider: string | null,
) {
  const weight = keywordWeight(cadence, depth, now, projectDepth);
  const provider = policy && policy !== "project" ? policy : projectProvider;
  // rankUnitCents already prices all pages at this depth for one check.
  const perRunCents =
    !cadence ||
    cadence.archivedAt ||
    !cadence.enabled ||
    cadence.frequency === "manual" ||
    cadence.frequency === "paused"
      ? 0
      : provider
        ? rankUnitCents(resolveSerpDepth(depth ?? projectDepth), provider)
        : null;
  if (weight === null) return { cents: null, perRunCents, runs: null, weight: null };
  if (weight === 0) return { cents: 0, perRunCents, runs: 0, weight: 0 };
  if (perRunCents === null) return { cents: null, perRunCents, runs: null, weight };
  const pages = pagesPerCheck(resolveSerpDepth(depth ?? projectDepth));
  const runs = pages === 0 ? null : weight / pages;
  if (runs === null) return { cents: null, perRunCents, runs: null, weight };
  return { cents: Number((perRunCents * runs).toFixed(6)), perRunCents, runs, weight };
}

/**
 * Compare projected cents when both sides have a provider price.
 * An unknown price falls back to page weight and needs review unless the weight falls.
 */
export function keywordCadenceRequiresReview(
  current: KeywordCadence | null,
  target: Pick<KeywordCadence, "cronExpression" | "frequency"> & {
    providerPolicy?: string | null;
    serpDepth?: number | null;
  },
  projectDepth: number,
  now = new Date(),
  projectProvider: string | null = null,
) {
  if (target.frequency === "manual" || target.frequency === "paused") return false;
  const beforeDepth = current?.serpDepth ?? projectDepth;
  const afterDepth =
    target.serpDepth === undefined ? beforeDepth : (target.serpDepth ?? projectDepth);
  const beforePolicy = current?.providerPolicy ?? null;
  const afterPolicy = target.providerPolicy === undefined ? beforePolicy : target.providerPolicy;
  const afterCadence: KeywordCadence = {
    archivedAt: null,
    cronExpression: target.cronExpression,
    enabled: true,
    frequency: target.frequency,
    serpDepth: afterDepth,
  };
  const before = keywordProjection(
    current,
    beforeDepth,
    beforePolicy,
    now,
    projectDepth,
    projectProvider,
  );
  const after = keywordProjection(
    afterCadence,
    afterDepth,
    afterPolicy,
    now,
    projectDepth,
    projectProvider,
  );
  const afterReview = {
    archived: false,
    cronExpression: afterCadence.cronExpression,
    enabled: true,
    frequency: afterCadence.frequency,
    jitterMinutes: 0,
    publicId: "keyword-review",
    serpDepth: afterDepth,
    timeOfDay: null,
    timezone: "UTC",
  };
  const beforeReview = current
    ? {
        archived: Boolean(current.archivedAt),
        cronExpression: current.cronExpression,
        enabled: current.enabled,
        frequency: current.frequency,
        jitterMinutes: 0,
        publicId: "keyword-review",
        serpDepth: beforeDepth,
        timeOfDay: null,
        timezone: "UTC",
      }
    : null;
  const miss = calendarMissReason(beforeReview, afterReview, now, undefined, {
    after: after.perRunCents,
    before: before.perRunCents,
  });
  const nearTerm = nearTermCostIncreased(
    { cadence: beforeReview, perRunCents: before.perRunCents },
    { cadence: afterReview, perRunCents: after.perRunCents },
    now,
  );
  if (miss !== undefined) return miss !== null || nearTerm;
  if (
    before.cents !== null &&
    after.cents !== null &&
    before.runs !== null &&
    after.runs !== null &&
    before.perRunCents !== null &&
    after.perRunCents !== null
  ) {
    return (
      projectionCostIncreased(
        {
          cents: before.cents,
          frequency: beforeReview?.frequency ?? null,
          perRunCents: before.perRunCents,
          runs: before.runs,
        },
        {
          cents: after.cents,
          frequency: afterReview.frequency,
          perRunCents: after.perRunCents,
          runs: after.runs,
        },
      ) || nearTerm
    );
  }
  if (before.weight === null || after.weight === null) return true;
  if (weightsProveNoIncrease(before, after)) return false;
  if (
    current &&
    after.weight === before.weight &&
    sameKeywordCadence(current, afterCadence, beforeDepth, afterDepth)
  ) {
    return false;
  }
  return true;
}
