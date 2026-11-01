import type { ProjectBudgetRow } from "@/lib/metering/project-budget-display";
import type { ProjectUsageViews, UsageConnection } from "@/lib/metering/user-views";
import type { Figure } from "@usagekit/views";

/** One provider connection with its active limit rows, app traffic first. */
export type UsageLimitEntry = {
  connection: UsageConnection;
  label: string;
  rows: ProjectBudgetRow[];
};

/** Select active constraints by public identity, without adding overlapping counters. */
export function usageLimitEntries(data: ProjectUsageViews): UsageLimitEntry[] {
  if (data.status !== "available") return [];
  return data.connections.flatMap((connection) => {
    const rows = data.budgets.filter(
      (row) =>
        !row.redacted &&
        row.kind === "connection" &&
        (row.display?.connectionId === connection.connectionId ||
          row.target === connection.connectionId) &&
        (connection.credentialSource === "hosted"
          ? row.unit === "customer_cents"
          : row.unit !== "customer_cents"),
    );
    return rows.length
      ? [
          {
            connection,
            rows: rows.sort(
              (a, b) =>
                Number(a.traffic.kind === "surface" && a.traffic.surface === "programmatic") -
                Number(b.traffic.kind === "surface" && b.traffic.surface === "programmatic"),
            ),
            label: rows[0].display?.providerLabel ?? connection.provider,
          },
        ]
      : [];
  });
}

/** Geometry is display-only and comes from the host's budget projection. */
export function overviewPercent(row: ProjectBudgetRow): number | null {
  if (!row.bar) return null;
  const extent = Number(row.bar.limit);
  return extent > 0 ? ((Number(row.bar.used) + Number(row.bar.reserved)) / extent) * 100 : null;
}

export type OverviewFigureLabels = { noLimit: string; unknown: string };

export function overviewFigure(
  value: Figure | "unlimited",
  format: (figure: Exclude<Figure, "unavailable">) => string | null,
  unit: (unit: string) => string,
  labels: OverviewFigureLabels,
): string {
  if (value === "unlimited") return labels.noLimit;
  if (value === "unavailable" || value.certainty === "unknown") return labels.unknown;
  return [format(value) ?? labels.unknown, unit(value.unit)].filter(Boolean).join(" ");
}

/** A known figure, or null when the reading is missing or uncertain. */
export function knownFigure(value: Figure | "unlimited"): Exclude<Figure, "unavailable"> | null {
  return typeof value === "string" || value.certainty === "unknown" ? null : value;
}

export type ProjectLimitMode = "single" | "split";

/**
 * Project-wide limits by valuation: Credits count customer charges and your keys keep the
 * admission valuation. An unsplit project has only the shared budget_cents limit.
 */
export function projectLimitRows(data: ProjectUsageViews) {
  const rows =
    data.status === "available"
      ? data.budgets.filter((row) => row.kind === "group" && !row.redacted)
      : [];
  return {
    credits: rows.find((row) => row.unit === "customer_cents"),
    own: rows.find((row) => row.unit === "budget_cents"),
  };
}
