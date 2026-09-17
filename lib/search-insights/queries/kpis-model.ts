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

export type SearchInsightsKpiMetric =
  | "clicks"
  | "clicks_to_sessions"
  | "ctr"
  | "impressions"
  | "position";

export type SearchInsightsKpiValueKind = "count" | "percentage" | "position";

export type SearchInsightsKpiDelta =
  | { kind: "changed"; unit: "percentage_points" | "percent_change" | "position"; value: number }
  | { kind: "new" | "no_data" | "unchanged" };

export type SearchInsightsKpi = {
  delta: SearchInsightsKpiDelta;
  dir: DeltaDirection;
  metric: SearchInsightsKpiMetric;
  previous: number | null;
  source: "gsc";
  value: number;
  valueKind: SearchInsightsKpiValueKind;
};

export type ClicksToSessionsKpi =
  | { kind: "hidden"; reason: "zero_clicks"; source: "gsc" }
  | { kind: "visible"; kpi: SearchInsightsKpi };

export type TotalsRow = {
  clicks: bigint | number;
  impressions: bigint | number;
  positionWeight: number;
};

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

// Rounded to the precision the card shows before the sign is decided, so a change too small
// to render never comes out as a signed zero.
function rounded(value: number, digits: number) {
  const next = Number(value.toFixed(digits));
  return next === 0 ? 0 : next;
}

function rawUnchanged(): SearchInsightsKpiDelta {
  return { kind: "unchanged" };
}

function rawNew(): SearchInsightsKpiDelta {
  return { kind: "new" };
}

function rawNoData(): SearchInsightsKpiDelta {
  return { kind: "no_data" };
}

function hasRows(totals: WindowTotals) {
  return totals.impressions > 0;
}

function rawCountDelta(
  current: number,
  previous: number,
): {
  delta: SearchInsightsKpiDelta;
  dir: DeltaDirection;
} {
  if (previous <= 0)
    return current > 0 ? { delta: rawNew(), dir: "up" } : { delta: rawUnchanged(), dir: "flat" };
  const change = rounded((current - previous) / previous, 3);
  if (change === 0) return { delta: rawUnchanged(), dir: "flat" };
  return {
    delta: { kind: "changed", unit: "percent_change", value: change },
    dir: change > 0 ? "up" : "down",
  };
}

function rawPercentagePointDelta(
  currentRate: number,
  currentDenominator: number,
  previousRate: number,
  previousDenominator: number,
): { delta: SearchInsightsKpiDelta; dir: DeltaDirection } {
  if (currentDenominator <= 0)
    return previousDenominator > 0
      ? { delta: rawNoData(), dir: "flat" }
      : { delta: rawUnchanged(), dir: "flat" };
  if (previousDenominator <= 0) return { delta: rawNew(), dir: "up" };
  const change = rounded(currentRate - previousRate, 4);
  if (change === 0) return { delta: rawUnchanged(), dir: "flat" };
  return {
    delta: { kind: "changed", unit: "percentage_points", value: change },
    dir: change > 0 ? "up" : "down",
  };
}

function rawPositionDelta(
  current: WindowTotals,
  previous: WindowTotals,
): {
  delta: SearchInsightsKpiDelta;
  dir: DeltaDirection;
} {
  if (!hasRows(current))
    return hasRows(previous)
      ? { delta: rawNoData(), dir: "flat" }
      : { delta: rawUnchanged(), dir: "flat" };
  if (!hasRows(previous)) return { delta: rawNew(), dir: "up" };
  const change = rounded(previous.position - current.position, 1);
  if (change === 0) return { delta: rawUnchanged(), dir: "flat" };
  return {
    delta: { kind: "changed", unit: "position", value: Math.abs(change) },
    dir: change > 0 ? "up" : "down",
  };
}

export function searchInsightsKpis(
  totals: WindowTotalsPair,
  previousWindowCovered = true,
): SearchInsightsKpi[] {
  const { current, previous } = totals;
  // One decision for the whole row: a compared period with no impressions holds no rows, so
  // every card reports the absence rather than measuring against numbers nobody recorded.
  const previousValue = (value: number) =>
    previousWindowCovered && hasRows(previous) ? value : null;
  const guarded = (delta: { delta: SearchInsightsKpiDelta; dir: DeltaDirection }) =>
    previousWindowCovered ? delta : { delta: rawNew(), dir: "flat" as const };
  return [
    {
      ...guarded(rawCountDelta(current.clicks, previous.clicks)),
      metric: "clicks",
      previous: previousValue(previous.clicks),
      source: "gsc",
      value: current.clicks,
      valueKind: "count",
    },
    {
      ...guarded(rawCountDelta(current.impressions, previous.impressions)),
      metric: "impressions",
      previous: previousValue(previous.impressions),
      source: "gsc",
      value: current.impressions,
      valueKind: "count",
    },
    {
      ...guarded(
        rawPercentagePointDelta(
          current.ctr,
          current.impressions,
          previous.ctr,
          previous.impressions,
        ),
      ),
      metric: "ctr",
      previous: previousValue(previous.ctr),
      source: "gsc",
      value: current.ctr,
      valueKind: "percentage",
    },
    {
      ...guarded(rawPositionDelta(current, previous)),
      metric: "position",
      previous: previousValue(previous.position),
      source: "gsc",
      value: current.position,
      valueKind: "position",
    },
  ];
}

export function clicksToSessionsKpi(
  clicks: WindowTotalsPair,
  sessions: WindowSessionsPair,
  previousWindowCovered = true,
): ClicksToSessionsKpi {
  if (clicks.current.clicks === 0) return { kind: "hidden", reason: "zero_clicks", source: "gsc" };
  const current = sessions.current / clicks.current.clicks;
  const previous = clicks.previous.clicks > 0 ? sessions.previous / clicks.previous.clicks : 0;
  return {
    kind: "visible",
    kpi: {
      ...(previousWindowCovered
        ? rawPercentagePointDelta(current, clicks.current.clicks, previous, clicks.previous.clicks)
        : { delta: rawNew(), dir: "flat" as const }),
      metric: "clicks_to_sessions",
      previous: previousWindowCovered && clicks.previous.clicks > 0 ? previous : null,
      source: "gsc",
      value: current,
      valueKind: "percentage",
    },
  };
}
