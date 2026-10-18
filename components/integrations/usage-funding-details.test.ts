import { projectUsageFixture } from "@/lib/metering/shared-view-fixtures";
import type { Figure } from "@usagekit/views";
import { describe, expect, it } from "vitest";
import { usageFundingDetails, usageFundingSummary } from "./usage-funding-details";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing test fixture row");
  return value;
}

const amount = (text: string, unit: string) => ({ text, unit, certainty: "measured" as const });

function mixedUsage() {
  const data = projectUsageFixture();
  const byok = required(data.detail.rows[0]);
  data.detail.units = ["units", "requests", "customer_cents"];
  data.detail.rows = [
    byok,
    {
      ...byok,
      key: "platform",
      fundingSource: "platform",
      cost: amount("99", "cents"),
      units: {
        units: amount("3", "units"),
        requests: amount("3", "requests"),
        customer_cents: amount("13.0001", "customer_cents"),
      },
    },
  ];
  return data;
}

describe("funding-specific usage details", () => {
  it("uses retained customer credits, keeps requests and leaves BYOK native costs intact", () => {
    const data = mixedUsage();
    const before = structuredClone(data.detail);
    const [byok, platform] = usageFundingDetails(data.detail);
    expect(byok?.view.rows[0]?.cost).toEqual(amount("12.3456", "cents"));
    expect(byok?.view.units).toEqual(["units", "requests"]);
    expect(platform?.view.rows[0]?.cost).toEqual(amount("13.0001", "customer_cents"));
    expect(platform?.view.units).toEqual(["requests"]);
    expect(data.detail).toEqual(before);
  });
  it("never substitutes a provider's cost when customer pricing is missing or unknown", () => {
    const data = mixedUsage();
    const row = required(data.detail.rows[1]);
    const variants: Record<string, Figure>[] = [
      { requests: amount("3", "requests") },
      { customer_cents: { text: "", unit: "customer_cents", certainty: "unknown" as const } },
    ];
    for (const units of variants) {
      const result = usageFundingDetails({ ...data.detail, rows: [{ ...row, units }] });
      expect(result[0]?.view.rows[0]?.cost).toEqual({
        text: "",
        unit: "customer_cents",
        certainty: "unknown",
      });
    }
  });
  it("does not show provider quota as the customer's credit spend in summary cards", () => {
    const data = mixedUsage();
    const row = required(data.summary.funding[0]);
    data.summary.funding = [
      row,
      { ...row, fundingSource: "platform", measurements: required(data.detail.rows[1]).units },
    ];
    const view = usageFundingSummary(data.summary);
    expect(view.funding[0]).toEqual(row);
    expect(view.funding[1]?.measurements).toEqual({
      requests: amount("3", "requests"),
      customer_cents: amount("13.0001", "customer_cents"),
    });
    expect(data.summary.funding[1]?.measurements.units).toBeDefined();
  });
});
