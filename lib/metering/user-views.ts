import {
  addMoney,
  addQuantity,
  type Measurement,
  type UsagePage,
  type UsageRow,
} from "@usagekit/core";
import type { UsageSummaryView, UsageView } from "@usagekit/views";
import { usageSummaryFromPages } from "@usagekit/views";
import type { ProjectBudgetRow } from "./project-budget-display";

export const usageUnits = ["cents", "units", "customer_cents", "requests"] as const;
export type UsageConnection = { connectionId: string; provider: string; primary?: boolean };
export type ProjectUsageViews = {
  status: "available" | "unavailable" | "restricted";
  from: string;
  to: string;
  summary: UsageSummaryView;
  detail: UsageView;
  budgets: ProjectBudgetRow[];
  connections: UsageConnection[];
  paidWorkBlocked: boolean | null;
  unresolved: number;
  oldestUnresolvedAt: string | null;
  truncated: boolean;
};
export function emptyProjectUsage(now = new Date()): ProjectUsageViews {
  return {
    status: "unavailable",
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    to: now.toISOString(),
    summary: usageSummaryFromPages([], usageUnits),
    detail: {
      state: "unavailable",
      rows: [],
      units: usageUnits,
      groupBy: ["connection", "provider", "surface", "source"],
      asOf: null,
      watermark: null,
      nextCursor: null,
      problem: null,
    },
    budgets: [],
    connections: [],
    paidWorkBlocked: null,
    unresolved: 0,
    oldestUnresolvedAt: null,
    truncated: false,
  };
}
/** Only ungrouped current-owner rows enter the additive shared summary. */
export function ownerSummary(pages: readonly UsagePage[], owner: string): UsageSummaryView {
  const summary = usageSummaryFromPages(
    pages.map((page) => ({
      ...page,
      rows: page.rows
        .filter((row) => row.dimensions.principal === owner)
        .map((row) => ({ ...row, dimensions: {} })),
    })),
    usageUnits,
  );
  const funding = summary.funding.map((row, index) => ({
    ...row,
    key: `funding-${index}`,
    costOwner: "",
    cost:
      row.fundingSource === "platform"
        ? { text: "", unit: "cents", certainty: "unknown" as const }
        : row.cost,
    measurements: Object.fromEntries(
      Object.entries(row.measurements).filter(
        ([unit]) =>
          unit !== "cents" &&
          unit !== "units" &&
          (unit !== "customer_cents" || row.fundingSource === "platform"),
      ),
    ),
  }));
  return {
    ...summary,
    cost: funding.some((row) => row.fundingSource === "platform") ? "unavailable" : summary.cost,
    measurements: Object.fromEntries(
      Object.entries(summary.measurements).filter(([unit]) => unit !== "cents" && unit !== "units"),
    ),
    funding,
    watermark: null,
    nextCursor: null,
    problem: null,
  };
}
/** Replace internal dimensions and keys before a shared view crosses the server boundary. */
export function ownerDetail(
  view: UsageView,
  owner: string,
  refs: ReadonlyMap<string, string>,
): UsageView {
  const rows = view.rows
    .filter((row) => row.dimensions.principal === owner)
    .map((row, index) => {
      const units = Object.fromEntries(
        Object.entries(row.units).filter(
          ([unit]) =>
            unit !== "cents" && (unit !== "customer_cents" || row.fundingSource === "platform"),
        ),
      );
      const visible = Object.values(units);
      const certainty =
        visible.length === 0 ||
        visible.some((value) => value === "unavailable" || value.certainty === "unknown")
          ? ("unknown" as const)
          : visible.some((value) => value !== "unavailable" && value.certainty === "estimated")
            ? ("estimated" as const)
            : ("measured" as const);
      return {
        ...row,
        key: `usage-${index}`,
        certainty: row.fundingSource === "platform" ? certainty : row.certainty,
        costOwner: "",
        dimensions: {
          connection: refs.get(row.dimensions.connection) ?? "",
          provider: row.dimensions.provider ?? "",
          surface: row.dimensions.surface ?? "",
          source: row.dimensions.source ?? "",
        },
        cost:
          row.fundingSource === "platform"
            ? { text: "", unit: "cents", certainty: "unknown" as const }
            : row.cost,
        units,
      };
    });
  return {
    ...view,
    state: view.state === "ok" && !rows.length ? "empty" : view.state,
    rows,
    groupBy: ["connection", "provider", "surface", "source"],
    nextCursor: null,
    units: view.units.filter((unit) => unit !== "cents"),
    watermark: null,
    problem: null,
  };
}

/** The detail grouping is additive (no tag/pool fanout). Collapse it before the
 * shared summary mapper, so totals and visible rows use exactly one snapshot. */
export function ownerDetailSummary(pages: readonly UsagePage[], owner: string): UsageSummaryView {
  const first = pages[0];
  if (
    !first ||
    pages.some((page) => page.watermark !== first.watermark || page.asOf !== first.asOf)
  )
    return ownerSummary(pages, owner);
  const rows = new Map<string, UsageRow>();
  for (const row of pages.flatMap((page) => page.rows)) {
    if (row.dimensions.principal !== owner) continue;
    if (row.unknownOperations < 0n) throw new Error("Invalid unknown operation count");
    const key = JSON.stringify([row.fundingSource, row.costOwner]);
    const previous = rows.get(key);
    if (!previous) {
      rows.set(key, { ...row, dimensions: { principal: owner } });
      continue;
    }
    const measurements = new Map(
      previous.measurements.map((measurement) => [measurement.unit, measurement]),
    );
    for (const [unit, prior] of measurements) {
      const measurement = row.measurements.find((value) => value.unit === unit);
      if (!measurement) {
        measurements.delete(unit);
        continue;
      }
      const merged: Measurement =
        prior.certainty === "unknown" || measurement.certainty === "unknown"
          ? { unit: measurement.unit, certainty: "unknown", quantity: null }
          : {
              unit: measurement.unit,
              certainty:
                prior.certainty === "estimated" || measurement.certainty === "estimated"
                  ? "estimated"
                  : "measured",
              quantity: addQuantity(prior.quantity, measurement.quantity),
            };
      measurements.set(measurement.unit, merged);
    }
    rows.set(key, {
      ...previous,
      cost:
        previous.cost.certainty === "unknown" || row.cost.certainty === "unknown"
          ? { certainty: "unknown", money: null }
          : {
              certainty:
                previous.cost.certainty === "estimated" || row.cost.certainty === "estimated"
                  ? "estimated"
                  : "measured",
              money: addMoney(previous.cost.money, row.cost.money),
            },
      measurements: [...measurements.values()],
      unknownOperations: previous.unknownOperations + row.unknownOperations,
    });
  }
  const summary = ownerSummary(
    [{ ...first, rows: [...rows.values()], nextCursor: pages.at(-1)?.nextCursor }],
    owner,
  );
  return { ...summary, pages: pages.length };
}
