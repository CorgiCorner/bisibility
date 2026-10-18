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

/** Provider quota is evidence of provider consumption, not the customer's credit price. */
export function usageFundingSummary(view: UsageSummaryView): UsageSummaryView {
  return {
    ...view,
    funding: view.funding.map((row) =>
      row.fundingSource === "platform"
        ? {
            ...row,
            measurements: Object.fromEntries(
              Object.entries(row.measurements).filter(
                ([unit]) => unit !== "units" && unit !== "cents",
              ),
            ),
          }
        : row,
    ),
  };
}
