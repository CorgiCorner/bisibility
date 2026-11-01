import type { UsageSummaryView, UsageView } from "@usagekit/views";

/** Keep provider quantities separate from customer charges without changing stored evidence. */
export function usageFundingDetails(view: UsageView) {
  return (["byok", "platform"] as const).flatMap((fundingSource) => {
    const rows = view.rows.filter((row) => row.fundingSource === fundingSource);
    if (!rows.length) return [];
    const platform = fundingSource === "platform";
    return [
      {
        fundingSource,
        view: {
          ...view,
          rows: rows.map((row) =>
            platform
              ? {
                  ...row,
                  cost:
                    row.units.customer_cents && row.units.customer_cents !== "unavailable"
                      ? row.units.customer_cents
                      : {
                          text: "",
                          unit: "customer_cents",
                          certainty: "unknown" as const,
                        },
                }
              : row,
          ),
          units: view.units.filter(
            (unit) => unit !== "customer_cents" && (!platform || unit !== "units"),
          ),
          nextCursor: null,
        },
      },
    ];
  });
}

/**
 * Summary cards show only figures a reader can act on. Credits rows drop provider quota, which
 * is evidence of provider consumption rather than the customer's credit price, and native units;
 * and every row drops the raw request count: it has no limit and no cost of its own.
 */
export function usageFundingSummary(view: UsageSummaryView): UsageSummaryView {
  const hidden = (fundingSource: string, unit: string) =>
    unit === "requests" || (fundingSource === "platform" && (unit === "units" || unit === "cents"));
  return {
    ...view,
    measurements: Object.fromEntries(
      Object.entries(view.measurements).filter(([unit]) => unit !== "requests"),
    ),
    funding: view.funding.map((row) => ({
      ...row,
      measurements: Object.fromEntries(
        Object.entries(row.measurements).filter(([unit]) => !hidden(row.fundingSource, unit)),
      ),
    })),
  };
}
