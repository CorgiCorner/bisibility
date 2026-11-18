import { cronHasCalendarRestriction } from "@/lib/rank-check/cron-count";
import {
  cadenceIsActive,
  nearTermCostIncreased,
  projectionCostIncreased,
  projectMemberCents,
  type ReviewCadence,
  reviewHorizonRuns,
  reviewOccurrences,
} from "./review-cost";

export const REVIEW_REASONS = [
  "cost_increase",
  "manual_to_scheduled",
  "provider_route_change",
  "price_unknown",
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

const EXEMPT = new Set(["archive", "delete", "manual", "noop", "pause", "restore"]);

export type SpendQuote = {
  cadence: ReviewCadence | null;
  members: number;
  /** Per member, per run. Null when the list price is unknown. */
  unitCents: number | null;
};

export type SpendGroup = {
  unchanged?: boolean;
  after: SpendQuote;
  before: SpendQuote;
  providerAfter: string | null;
  providerBefore: string | null;
};

export type ScheduleSpend = {
  after: SpendQuote;
  before: SpendQuote;
  /** One quote per source schedule. Mixed keyword sets must not share one cadence. */
  groups?: readonly SpendGroup[];
  manualToScheduled: boolean;
  now: Date;
  operation: string;
  projectDepth: number;
  providerAfter: string | null;
  providerBefore: string | null;
  /** Preview window start. Submit binds the token to this instant. */
  windowStart?: Date;
};

export type ScheduleSpendDecision = {
  cost_after_cents: number | null;
  cost_before_cents: number | null;
  requires_review: boolean;
  review_reasons: ReviewReason[];
};

function providerId(policy: string | null) {
  return policy && policy !== "project" ? policy : null;
}

export function weightsProveNoIncrease(
  before: { weight: number | null },
  after: { weight: number | null },
) {
  if (before.weight === null || after.weight === null) return false;
  if (before.weight === 0 && after.weight === 0) return true;
  // A year-long zero is not a decrease unless the current cadence is zero too.
  if (after.weight === 0) return false;
  return after.weight < before.weight;
}

function projectQuote(input: ScheduleSpend, quote: SpendQuote) {
  return projectMemberCents(
    quote.cadence,
    quote.members,
    quote.unitCents,
    input.projectDepth,
    input.now,
    input.windowStart,
  );
}

function perRunCents(quote: SpendQuote) {
  if (!cadenceIsActive(quote.cadence) || quote.members <= 0) return 0;
  return quote.unitCents === null ? null : quote.members * quote.unitCents;
}

function quoteRuns(cadence: ReviewCadence | null, now: Date, windowStart?: Date) {
  if (!cadence) return 0;
  return reviewOccurrences(cadence, now, windowStart) ?? 0;
}

export function activeCalendarMiss(
  cadence: ReviewCadence | null | undefined,
  now: Date,
  windowStart?: Date,
) {
  if (!cadence || !cadenceIsActive(cadence) || cadence.frequency !== "custom_cron") return false;
  if (!cronHasCalendarRestriction(cadence.cronExpression)) return false;
  return reviewOccurrences(cadence, now, windowStart) === 0;
}

function sameCronZone(
  before: ReviewCadence | null | undefined,
  after: ReviewCadence | null | undefined,
) {
  return Boolean(
    before &&
      after &&
      before.cronExpression === after.cronExpression &&
      (before.timezone || "UTC") === (after.timezone || "UTC"),
  );
}

/** Undefined keeps the ordinary projection; null means the horizon proves no increase. */
export function calendarMissReason(
  before: ReviewCadence | null | undefined,
  after: ReviewCadence | null | undefined,
  now: Date,
  windowStart: Date | undefined,
  perRun: { before: number | null; after: number | null },
): ReviewReason | null | undefined {
  const afterMiss = activeCalendarMiss(after, now, windowStart);
  const beforeMiss = activeCalendarMiss(before, now, windowStart);
  if (!afterMiss && !beforeMiss) return undefined;
  if (perRun.before === null || perRun.after === null) return "price_unknown";
  if (afterMiss && beforeMiss && sameCronZone(before, after) && perRun.after <= perRun.before) {
    return null;
  }
  const afterRuns = reviewHorizonRuns(after, now, windowStart);
  const beforeRuns = reviewHorizonRuns(before, now, windowStart);
  if (afterRuns !== null && beforeRuns !== null) {
    return afterRuns * perRun.after > beforeRuns * perRun.before ? "cost_increase" : null;
  }
  if (afterMiss && !beforeMiss) return "price_unknown";
  if (afterMiss && beforeMiss) return "cost_increase";
  return undefined;
}

function assessOne(input: ScheduleSpend): ScheduleSpendDecision {
  const before = projectQuote(input, input.before);
  const after = projectQuote(input, input.after);
  const reasons: ReviewReason[] = [];
  if (!EXEMPT.has(input.operation)) {
    if (input.manualToScheduled) reasons.push("manual_to_scheduled");
    if (providerId(input.providerBefore) !== providerId(input.providerAfter)) {
      reasons.push("provider_route_change");
    }
    const priced = before.cents !== null && after.cents !== null;
    const miss = calendarMissReason(
      input.before.cadence,
      input.after.cadence,
      input.now,
      input.windowStart,
      { after: perRunCents(input.after), before: perRunCents(input.before) },
    );
    if (miss !== undefined) {
      if (miss) reasons.push(miss);
    } else if (
      priced &&
      projectionCostIncreased(
        {
          cents: before.cents as number,
          frequency: input.before.cadence?.frequency ?? null,
          perRunCents: perRunCents(input.before) ?? 0,
          runs: quoteRuns(input.before.cadence, input.now, input.windowStart),
        },
        {
          cents: after.cents as number,
          frequency: input.after.cadence?.frequency ?? null,
          perRunCents: perRunCents(input.after) ?? 0,
          runs: quoteRuns(input.after.cadence, input.now, input.windowStart),
        },
      )
    ) {
      reasons.push("cost_increase");
    } else if (!priced && !weightsProveNoIncrease(before, after)) {
      reasons.push("price_unknown");
    }
    if (
      nearTermCostIncreased(
        { cadence: input.before.cadence, perRunCents: perRunCents(input.before) },
        { cadence: input.after.cadence, perRunCents: perRunCents(input.after) },
        input.now,
        input.windowStart,
      ) &&
      !reasons.includes("cost_increase")
    ) {
      reasons.push("cost_increase");
    }
  }
  return {
    cost_after_cents: after.cents,
    cost_before_cents: before.cents,
    requires_review: reasons.length > 0,
    review_reasons: reasons,
  };
}

function horizonOrQuoteWeight(input: ScheduleSpend, before: SpendQuote, after: SpendQuote) {
  const missed =
    activeCalendarMiss(before.cadence, input.now, input.windowStart) ||
    activeCalendarMiss(after.cadence, input.now, input.windowStart);
  if (missed) {
    const horizonCost = (quote: SpendQuote) => {
      const runs = reviewHorizonRuns(quote.cadence, input.now, input.windowStart);
      const unit = perRunCents(quote);
      return runs === null || unit === null ? null : runs * unit;
    };
    return { after: horizonCost(after), before: horizonCost(before) };
  }
  return {
    after: projectQuote(input, after).weight,
    before: projectQuote(input, before).weight,
  };
}

function uniqueReasons(reasons: readonly ReviewReason[]) {
  return REVIEW_REASONS.filter((reason) => reasons.includes(reason));
}

/** Price each keyword group on its own, then sum. An unpriced group still needs review. */
function assessGroups(input: ScheduleSpend): ScheduleSpendDecision {
  const groups = input.groups ?? [];
  const parts = groups.map((group) =>
    assessOne({
      ...input,
      ...group,
      groups: undefined,
      manualToScheduled: false,
      ...(group.unchanged ? { operation: "noop" } : {}),
    }),
  );
  const weights = groups.map((group) => horizonOrQuoteWeight(input, group.before, group.after));
  const everyGroupDecreases = weights.every((row) =>
    weightsProveNoIncrease({ weight: row.before }, { weight: row.after }),
  );
  let reasons = uniqueReasons(parts.flatMap((part) => part.review_reasons));
  if (input.manualToScheduled && !reasons.includes("manual_to_scheduled")) {
    reasons = uniqueReasons([...reasons, "manual_to_scheduled"]);
  }
  const nearTermIncrease =
    !EXEMPT.has(input.operation) &&
    groups.some((group) =>
      nearTermCostIncreased(
        { cadence: group.before.cadence, perRunCents: perRunCents(group.before) },
        { cadence: group.after.cadence, perRunCents: perRunCents(group.after) },
        input.now,
        input.windowStart,
      ),
    );
  const unpriced = reasons.includes("price_unknown");
  if (unpriced && everyGroupDecreases) {
    reasons = reasons.filter(
      (reason) => reason !== "price_unknown" && (nearTermIncrease || reason !== "cost_increase"),
    );
  }
  if (nearTermIncrease) reasons = uniqueReasons([...reasons, "cost_increase"]);
  const priced = parts.every(
    (part) => part.cost_before_cents !== null && part.cost_after_cents !== null,
  );
  const sum = (key: "cost_after_cents" | "cost_before_cents") =>
    parts.reduce((total, part) => total + (part[key] ?? 0), 0);
  return {
    cost_after_cents: priced ? sum("cost_after_cents") : null,
    cost_before_cents: priced ? sum("cost_before_cents") : null,
    requires_review: reasons.length > 0,
    review_reasons: reasons,
  };
}

export function assessScheduleSpend(input: ScheduleSpend): ScheduleSpendDecision {
  if (input.groups?.length) return assessGroups(input);
  return assessOne(input);
}
