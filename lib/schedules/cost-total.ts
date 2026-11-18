import type { Schedule } from "./types";

/** Free syncs are excluded; unknown paid estimates remain visible beside the known subtotal. */
export function scheduleCostTotal(schedules: readonly Schedule[]) {
  const billable = schedules.filter((row) => row.kind !== "data_sync" && row.state === "active");
  return {
    cents: billable.reduce((sum, row) => sum + (row.monthly_cost_estimate_cents ?? 0), 0),
    unknown: billable.filter((row) => row.monthly_cost_estimate_cents === null).length,
  };
}
