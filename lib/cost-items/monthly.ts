export const COST_BILLINGS = ["monthly", "yearly", "lifetime", "one_off"] as const;
export const COST_SPLITS = ["equal", "percent", "single_project"] as const;
export const LIFETIME_MONTHS = 36;
export const PERCENT_BASIS = 10_000;

export type CostBilling = (typeof COST_BILLINGS)[number];
export type CostSplit = (typeof COST_SPLITS)[number];
export type CostPriceChange = {
  amountMinor: number;
  effectiveFrom: string;
  reason: "discount" | "regular" | "trial";
};
export type CostProjectShare = { basisPoints: number | null; projectId: string };
export type MonthlyCostItem = {
  amountMinor: number;
  billing: CostBilling;
  priceChanges: readonly CostPriceChange[];
  projects: readonly CostProjectShare[];
  split: CostSplit;
  startedOn: string;
  endedOn: string | null;
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(value: string) {
  const match = DATE.exec(value);
  if (!match) throw new Error("Cost dates use YYYY-MM-DD.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error("Cost dates use a real calendar day.");
  }
  return { day, month, year };
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function monthKey(date: string) {
  parts(date);
  return date.slice(0, 7);
}

function monthIndex(startedOn: string, month: string) {
  const start = parts(startedOn);
  const [year, monthNumber] = month.split("-").map(Number);
  return (year - start.year) * 12 + (monthNumber - start.month);
}

/** Latest change on or before the day. The item amount applies before the first change. */
export function priceOnDay(item: MonthlyCostItem, day: string) {
  let amount = item.amountMinor;
  let from = "";
  for (const change of item.priceChanges) {
    if (change.effectiveFrom <= day && change.effectiveFrom >= from) {
      from = change.effectiveFrom;
      amount = change.amountMinor;
    }
  }
  return amount;
}

/** Half away from zero, so positive prices round 0.5 up. */
export function roundMinor(numerator: number, denominator: number) {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error("Cost rounding needs a safe integer fraction.");
  }
  const negative = numerator < 0;
  const value = Math.abs(numerator);
  const quotient = Math.floor(value / denominator);
  const remainder = value % denominator;
  const rounded = remainder * 2 >= denominator ? quotient + 1 : quotient;
  return negative ? -rounded : rounded;
}

function active(item: MonthlyCostItem, day: string) {
  if (day < item.startedOn) return false;
  if (item.endedOn && day > item.endedOn) return false;
  return true;
}

/**
 * One item's contribution to one calendar month, before a project split.
 * Yearly prices become amount/12. A lifetime price is spread over the 36
 * calendar months that start with `startedOn`, then zero. A one-off lands in
 * full in the month of `startedOn` at the price in effect that day. Recurring
 * prices change by day inside the month: inactive days contribute zero and the
 * active days are averaged, then rounded to minor units.
 */
export function itemMonthlyMinor(item: MonthlyCostItem, month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Cost months use YYYY-MM.");
  if (item.billing === "one_off") {
    if (monthKey(item.startedOn) !== month) return 0;
    if (item.endedOn && item.endedOn < item.startedOn) return 0;
    return priceOnDay(item, item.startedOn);
  }
  const lifetimeIndex = monthIndex(item.startedOn, month);
  if (item.billing === "lifetime" && (lifetimeIndex < 0 || lifetimeIndex >= LIFETIME_MONTHS)) {
    return 0;
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const days = daysInMonth(year, monthNumber);
  const divisor =
    item.billing === "yearly" ? 12 : item.billing === "lifetime" ? LIFETIME_MONTHS : 1;
  let sum = 0;
  for (let day = 1; day <= days; day += 1) {
    const date = iso(year, monthNumber, day);
    if (active(item, date)) sum += priceOnDay(item, date);
  }
  return roundMinor(sum, days * divisor);
}

/**
 * Splits an already-rounded monthly total. Equal parts use integer division and
 * give the remainder to the lowest project ids. Percent parts that use the full
 * basis give the leftover to the largest fractional remainder, with the same id
 * tie-break, so those parts sum to `total`. A percent below the full basis is
 * this project's share only: the rest is not attributed.
 */
export function splitMinor(total: number, split: CostSplit, projects: readonly CostProjectShare[]) {
  const ordered = [...projects].sort((left, right) =>
    left.projectId.localeCompare(right.projectId),
  );
  if (!ordered.length) return [];
  if (split === "single_project") {
    return ordered.map((project, index) => ({
      minor: index === 0 ? total : 0,
      projectId: project.projectId,
    }));
  }
  if (split === "equal") {
    const base = Math.floor(total / ordered.length);
    const remainder = total - base * ordered.length;
    return ordered.map((project, index) => ({
      minor: base + (index < remainder ? 1 : 0),
      projectId: project.projectId,
    }));
  }
  const basisSum = ordered.reduce((sum, project) => sum + (project.basisPoints ?? 0), 0);
  if (basisSum !== PERCENT_BASIS) {
    return ordered.map((project) => ({
      minor: roundMinor(total * (project.basisPoints ?? 0), PERCENT_BASIS),
      projectId: project.projectId,
    }));
  }
  const parts = ordered.map((project) => {
    const basisPoints = project.basisPoints ?? 0;
    const product = total * basisPoints;
    return {
      fraction: product % PERCENT_BASIS,
      minor: Math.floor(product / PERCENT_BASIS),
      projectId: project.projectId,
    };
  });
  let leftover = total - parts.reduce((sum, part) => sum + part.minor, 0);
  const ranked = [...parts].sort(
    (left, right) =>
      right.fraction - left.fraction || left.projectId.localeCompare(right.projectId),
  );
  for (const part of ranked) {
    if (leftover <= 0) break;
    part.minor += 1;
    leftover -= 1;
  }
  return parts.map((part) => ({ minor: part.minor, projectId: part.projectId }));
}

/** Full-month equivalent before a project split. A one-off stays whole. */
export function regularMonthlyMinor(billing: CostBilling, amountMinor: number) {
  if (billing === "yearly") return roundMinor(amountMinor, 12);
  if (billing === "lifetime") return roundMinor(amountMinor, LIFETIME_MONTHS);
  return amountMinor;
}

export function projectMonthlyMinor(item: MonthlyCostItem, projectId: string, month: string) {
  const total = itemMonthlyMinor(item, month);
  const share = splitMinor(total, item.split, item.projects).find(
    (part) => part.projectId === projectId,
  );
  return share?.minor ?? 0;
}

/** Freeze the current equal amounts as integer basis points, retaining the cent remainder order. */
export function equalCostBasisPoints(total: number, projects: readonly CostProjectShare[]) {
  const parts = splitMinor(total > 0 ? total : PERCENT_BASIS, "equal", projects);
  const divisor = total > 0 ? total : PERCENT_BASIS;
  const shares = parts.map((part) => ({
    projectId: part.projectId,
    basisPoints: Math.floor((part.minor * PERCENT_BASIS) / divisor),
    remainder: (part.minor * PERCENT_BASIS) % divisor,
  }));
  let left = PERCENT_BASIS - shares.reduce((sum, share) => sum + share.basisPoints, 0);
  for (const share of [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.projectId.localeCompare(b.projectId),
  )) {
    if (left-- <= 0) break;
    share.basisPoints += 1;
  }
  return shares.map(({ projectId, basisPoints }) => ({ projectId, basisPoints }));
}

/** An allocation edit must not redistribute another project's rounding remainder. */
export function preservesOtherCostShares(
  total: number,
  split: CostSplit,
  projects: readonly CostProjectShare[],
  projectId: string,
  basisPoints: number,
) {
  const before = splitMinor(total, split, projects);
  const normalized = split === "equal" ? equalCostBasisPoints(total, projects) : projects;
  const proposed = normalized.filter((project) => project.projectId !== projectId);
  if (basisPoints > 0) proposed.push({ projectId, basisPoints });
  const after = splitMinor(total, "percent", proposed);
  return before
    .filter((share) => share.projectId !== projectId)
    .every(
      (share) => after.find((next) => next.projectId === share.projectId)?.minor === share.minor,
    );
}

export function costShareUpdatePlan(
  current: Pick<MonthlyCostItem, "amountMinor" | "billing" | "projects" | "split">,
  projectId: string,
  requestedSplit: CostSplit,
  requestedBasisPoints: number,
) {
  const total = regularMonthlyMinor(current.billing, current.amountMinor);
  const shares = current.split === "equal" ? equalCostBasisPoints(total, current.projects) : [];
  const basisPoints =
    requestedSplit === "single_project"
      ? PERCENT_BASIS
      : requestedSplit === "equal"
        ? (shares.find((share) => share.projectId === projectId)?.basisPoints ??
          current.projects.find((share) => share.projectId === projectId)?.basisPoints ??
          0)
        : requestedBasisPoints;
  const preserves = preservesOtherCostShares(
    total,
    current.split,
    current.projects,
    projectId,
    basisPoints,
  );
  const keepEqual =
    !preserves &&
    current.split === "equal" &&
    basisPoints === shares.find((share) => share.projectId === projectId)?.basisPoints;
  return { basisPoints, blocked: !preserves && !keepEqual, keepEqual, shares };
}
