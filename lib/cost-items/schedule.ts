import { type CostPriceChange, roundMinor } from "./monthly";

export type DiscountDraft = {
  amountMinor: number | null;
  mode: "amount" | "percent";
  months: number | null;
  percent: number | null;
  until: string | null;
};

export type PriceDraft = {
  amountMinor: number;
  discount: DiscountDraft | null;
  startedOn: string;
  trialUntil: string | null;
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function shiftDays(date: string, days: number) {
  const match = DATE.exec(date);
  if (!match) throw new Error("Cost dates use YYYY-MM-DD.");
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function addMonths(date: string, months: number) {
  const match = DATE.exec(date);
  if (!match) throw new Error("Cost dates use YYYY-MM-DD.");
  const value = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const last = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, last));
  return value.toISOString().slice(0, 10);
}

export function discountAmount(amountMinor: number, discount: DiscountDraft) {
  if (discount.mode === "amount") return Math.max(0, discount.amountMinor ?? amountMinor);
  const percent = discount.percent ?? 0;
  return roundMinor(amountMinor * (100 - percent), 100);
}

/** The stored schedule. A trial is zero until the day after its date. A discount holds until the next regular change. */
export function buildPriceChanges(draft: PriceDraft): CostPriceChange[] {
  const changes: CostPriceChange[] = [];
  let cursor = draft.startedOn;
  if (draft.trialUntil) {
    changes.push({ amountMinor: 0, effectiveFrom: cursor, reason: "trial" });
    cursor = shiftDays(draft.trialUntil, 1);
  }
  if (draft.discount) {
    const until = draft.discount.until
      ? shiftDays(draft.discount.until, 1)
      : draft.discount.months
        ? addMonths(cursor, draft.discount.months)
        : null;
    if (until) {
      changes.push({
        amountMinor: discountAmount(draft.amountMinor, draft.discount),
        effectiveFrom: cursor,
        reason: "discount",
      });
      cursor = until;
    }
  }
  if (changes.length) {
    changes.push({ amountMinor: draft.amountMinor, effectiveFrom: cursor, reason: "regular" });
  }
  return changes;
}

export type ScheduleSegment = { amountMinor: number; from: string; until: string | null };

export function scheduleSegments(
  amountMinor: number,
  startedOn: string,
  changes: readonly CostPriceChange[],
): ScheduleSegment[] {
  const ordered = [...changes].sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  );
  if (!ordered.length) return [{ amountMinor, from: startedOn, until: null }];
  return ordered.map((change, index) => ({
    amountMinor: change.amountMinor,
    from: change.effectiveFrom,
    until: ordered[index + 1] ? shiftDays(ordered[index + 1].effectiveFrom, -1) : null,
  }));
}

export function activePriceNote(
  amountMinor: number,
  changes: readonly CostPriceChange[],
  today: string,
): { percent: number; until: string } | { until: string; trial: true } | null {
  const ordered = [...changes].sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  );
  const current = [...ordered].reverse().find((change) => change.effectiveFrom <= today);
  if (!current || current.reason === "regular") return null;
  const next = ordered.find((change) => change.effectiveFrom > current.effectiveFrom);
  if (!next) return null;
  const until = shiftDays(next.effectiveFrom, -1);
  if (current.reason === "trial") return { trial: true, until };
  if (amountMinor <= 0) return null;
  return { percent: roundMinor((amountMinor - current.amountMinor) * 100, amountMinor), until };
}

export type StoredPriceDraft = {
  discountAmount: string;
  discountMode: "amount" | "none" | "percent";
  discountMonths: string;
  discountPercent: string;
  discountSpan: "months" | "until";
  discountUntil: string;
  trialUntil: string;
};

function untilBefore(ordered: readonly CostPriceChange[], change: CostPriceChange) {
  const next = ordered.find((item) => item.effectiveFrom > change.effectiveFrom);
  return next ? shiftDays(next.effectiveFrom, -1) : "";
}

/** Rebuilds the drawer fields from the stored timeline. A discount keeps its end date. */
export function formFromChanges(
  amountMinor: number,
  changes: readonly CostPriceChange[],
): StoredPriceDraft {
  const ordered = [...changes].sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  );
  const trial = ordered.find((change) => change.reason === "trial");
  const discount = ordered.find((change) => change.reason === "discount");
  const percent =
    discount && amountMinor > 0
      ? roundMinor((amountMinor - discount.amountMinor) * 100, amountMinor)
      : 0;
  const percentMatches =
    discount !== undefined &&
    percent > 0 &&
    percent < 100 &&
    discountAmount(amountMinor, {
      amountMinor: null,
      mode: "percent",
      months: null,
      percent,
      until: null,
    }) === discount.amountMinor;
  return {
    discountAmount: discount && !percentMatches ? String(discount.amountMinor) : "",
    discountMode: discount ? (percentMatches ? "percent" : "amount") : "none",
    discountMonths: "1",
    discountPercent: percentMatches ? String(percent) : "",
    discountSpan: "until",
    discountUntil: discount ? untilBefore(ordered, discount) : "",
    trialUntil: trial ? untilBefore(ordered, trial) : "",
  };
}
