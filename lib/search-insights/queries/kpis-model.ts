export type WindowTotals = {
  clicks: number;
  ctr: number;
  impressions: number;
  position: number;
};

export type WindowTotalsPair = {
  current: WindowTotals;
  previous: WindowTotals;
};

export type WindowSessionsPair = {
  current: number;
  previous: number;
};

/** `up` is the improving direction, so a lower position counts as up; `flat` is no change. */
export type DeltaDirection = "down" | "flat" | "up";

export type SearchInsightsKpi = {
  delta: string;
  dir: DeltaDirection;
  label: string;
  prev: string;
  source: string;
  value: string;
};

export type TotalsRow = {
  clicks: bigint | number;
  impressions: bigint | number;
  positionWeight: number;
};

const KPI_SOURCE = "GSC";
const NO_BASELINE = "new";
// What a card says about a window that holds no rows. Its ratios come back as zeros, and a zero
// there is the absence of a measurement rather than a rate of nought or a position a page held.
const NO_DATA = "no data";

export const EMPTY_TOTALS: WindowTotals = { clicks: 0, ctr: 0, impressions: 0, position: 0 };

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * CTR is the window's clicks over its impressions and position is impression-weighted:
 * averaging the daily averages would let a day with three impressions outvote a day with
 * thirty thousand.
 */
export function windowTotals(row: TotalsRow | undefined): WindowTotals {
  if (!row) return EMPTY_TOTALS;
  const clicks = Number(row.clicks);
  const impressions = Number(row.impressions);
  return {
    clicks,
    ctr: ratio(clicks, impressions),
    impressions,
    position: ratio(Number(row.positionWeight), impressions),
  };
}

export function formatCount(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

export function formatCtr(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

export function formatPosition(value: number) {
  return value.toFixed(1);
}

// Rounded to the precision the card shows before the sign is decided, so a change too small
// to render never comes out as a signed zero.
function rounded(value: number, digits: number) {
  const next = Number(value.toFixed(digits));
  return next === 0 ? 0 : next;
}

function signed(value: number, digits: number, suffix: string) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`;
}

// No change has no direction: an arrow beside the word would assert one the copy denies.
const UNCHANGED = { delta: "unchanged", dir: "flat" as const };
const UNCOVERED_BASELINE = { delta: NO_BASELINE, dir: "flat" as const };

// Neither window measured anything comparable, so the line reports that instead of a distance.
const NOTHING_TO_COMPARE = { delta: NO_DATA, dir: "flat" as const };

function hasRows(totals: WindowTotals) {
  return totals.impressions > 0;
}

// The delta is read beside the two numbers the card prints, so it is measured between those
// printed numbers: diffing the raw values lets a card claim movement its own figures deny, or
// call one window unchanged while it shows 17.3 against 17.4.
function displayed(formatted: string) {
  return Number.parseFloat(formatted);
}

/**
 * A window with no earlier traffic has no percentage to report: dividing by zero would either
 * throw or invent an infinite gain, and both read as a number the customer can act on.
 */
export function countDelta(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? { delta: NO_BASELINE, dir: "up" as const } : UNCHANGED;
  const change = rounded(((current - previous) / previous) * 100, 1);
  // A change too small to print is unchanged, the same word the CTR and position cards use for
  // it: the four cards must not describe one flat window in two vocabularies.
  if (change === 0) return UNCHANGED;
  return { delta: signed(change, 1, "%"), dir: change > 0 ? ("up" as const) : ("down" as const) };
}

/**
 * Click-through rate moves in percentage points, never in percent of a percent. Both windows
 * have to hold rows for there to be a distance between them: an empty window's zero is the
 * absence of a measurement, and subtracting it would report a whole rate as a gain or a loss.
 */
export function ctrDelta(current: WindowTotals, previous: WindowTotals) {
  if (!hasRows(current)) return hasRows(previous) ? NOTHING_TO_COMPARE : UNCHANGED;
  if (!hasRows(previous)) return { delta: NO_BASELINE, dir: "up" as const };
  const change = rounded(displayed(formatCtr(current.ctr)) - displayed(formatCtr(previous.ctr)), 2);
  if (change === 0) return UNCHANGED;
  return {
    delta: `${signed(change, 2, "")} pp`,
    dir: change > 0 ? ("up" as const) : ("down" as const),
  };
}

/**
 * Lower is better, so the sentence names the direction rather than leaving a sign to read. Zero
 * is not a position any page holds, so a window without rows is reported as such rather than as
 * the distance from the top of the results - in either direction.
 */
export function positionDelta(current: WindowTotals, previous: WindowTotals) {
  if (!hasRows(current)) return hasRows(previous) ? NOTHING_TO_COMPARE : UNCHANGED;
  if (!hasRows(previous)) return { delta: NO_BASELINE, dir: "up" as const };
  const change = rounded(
    displayed(formatPosition(previous.position)) - displayed(formatPosition(current.position)),
    1,
  );
  if (change > 0) return { delta: `${change.toFixed(1)} better`, dir: "up" as const };
  if (change < 0) return { delta: `${Math.abs(change).toFixed(1)} worse`, dir: "down" as const };
  return UNCHANGED;
}

export function searchInsightsKpis(
  totals: WindowTotalsPair,
  previousWindowCovered = true,
): SearchInsightsKpi[] {
  const { current, previous } = totals;
  // One decision for the whole row: a compared period with no impressions holds no rows, so
  // every card reports the absence rather than measuring against numbers nobody recorded.
  const from = (formatted: string) =>
    previousWindowCovered && hasRows(previous) ? formatted : NO_DATA;
  const guarded = (delta: Pick<SearchInsightsKpi, "delta" | "dir">) =>
    previousWindowCovered ? delta : UNCOVERED_BASELINE;
  return [
    {
      ...guarded(countDelta(current.clicks, previous.clicks)),
      label: "Clicks",
      prev: from(formatCount(previous.clicks)),
      source: KPI_SOURCE,
      value: formatCount(current.clicks),
    },
    {
      ...guarded(countDelta(current.impressions, previous.impressions)),
      label: "Impressions",
      prev: from(formatCount(previous.impressions)),
      source: KPI_SOURCE,
      value: formatCount(current.impressions),
    },
    {
      ...guarded(ctrDelta(current, previous)),
      label: "CTR",
      prev: from(formatCtr(previous.ctr)),
      source: KPI_SOURCE,
      value: formatCtr(current.ctr),
    },
    {
      ...guarded(positionDelta(current, previous)),
      label: "Avg position",
      prev: from(formatPosition(previous.position)),
      source: KPI_SOURCE,
      value: formatPosition(current.position),
    },
  ];
}

export function organicSessionsKpi(totals: WindowSessionsPair): SearchInsightsKpi {
  return {
    ...countDelta(totals.current, totals.previous),
    label: "Organic sessions",
    prev: formatCount(totals.previous),
    source: "GA4",
    value: formatCount(totals.current),
  };
}
