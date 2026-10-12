import type { UsagePage, UsageRow } from "@usagekit/core";
import { describe, expect, it } from "vitest";
import * as views from "./user-views";

const row = (principal: string, fundingSource: "byok" | "platform" = "byok"): UsageRow => ({
  dimensions: { principal },
  fundingSource,
  costOwner: "private-payer",
  unknownOperations: 0n,
  cost: { certainty: "measured", money: { currency: "USD", units: 1234567n } },
  measurements: [
    {
      unit: fundingSource === "byok" ? "units" : "customer_cents",
      certainty: "measured",
      quantity: {
        unit: fundingSource === "byok" ? "units" : "customer_cents",
        value: 12345n,
        scale: 4,
      },
    },
  ],
});
const page = (rows: UsageRow[], nextCursor?: string): UsagePage => ({
  rows,
  watermark: "private-watermark",
  asOf: "2026-10-11T12:00:00.000Z",
  ...(nextCursor ? { nextCursor } : {}),
});

describe("customer shared views", () => {
  it("filters former owners before aggregation and strips identity-bearing keys and watermarks", () => {
    const view = views.ownerSummary([page([row("former")], "next"), page([row("owner")])], "owner");
    expect(view.cost).toEqual({ text: "123.4567", unit: "cents", certainty: "measured" });
    expect(view.rowCount).toBe(1);
    expect(JSON.stringify(view)).not.toMatch(/private-|owner|former/);
    expect(view.measurements.requests).toBe("unavailable");
  });
  it("retains customer charges but strips upstream platform cost including cents measurements", () => {
    const value = row("owner", "platform");
    value.measurements = [
      ...value.measurements,
      { unit: "cents", certainty: "measured", quantity: { unit: "cents", value: 999n, scale: 0 } },
    ];
    const view = views.ownerSummary([page([value])], "owner");
    expect(view.cost).toBe("unavailable");
    expect(view.funding[0].cost.certainty).toBe("unknown");
    expect(view.funding[0].measurements.customer_cents).toEqual({
      text: "1.2345",
      unit: "customer_cents",
      certainty: "measured",
    });
    expect(view.funding[0].measurements.cents).toBeUndefined();
    expect(JSON.stringify(view)).not.toMatch(/123\.4567|999|private-/);
  });
  it("withholds incomplete totals and preserves unknown versus confirmed zero", () => {
    expect(views.ownerSummary([page([row("owner")], "more")], "owner").complete).toBe(false);
    const value = row("owner");
    value.measurements = [
      {
        unit: "requests",
        certainty: "measured",
        quantity: { unit: "requests", value: 0n, scale: 0 },
      },
    ];
    const complete = views.ownerSummary([page([value])], "owner");
    expect(complete.measurements.requests).toEqual({
      text: "0",
      unit: "requests",
      certainty: "measured",
    });
  });
});
it("keeps native quantities in provider detail and never adds them into an unlabelled summary", () => {
  const result = views.ownerSummary([page([row("owner")])], "owner");
  expect(result.measurements).not.toHaveProperty("units");
  expect(result.funding[0].measurements).not.toHaveProperty("units");
});
it("removes an internal detail cursor before the customer view crosses the server boundary", () => {
  const detail = views.ownerDetail(
    {
      state: "ok",
      rows: [],
      units: [],
      groupBy: [],
      asOf: null,
      watermark: "private-watermark",
      nextCursor: "private-internal-cursor",
      problem: null,
    },
    "owner",
    new Map(),
  );
  expect(detail.nextCursor).toBeNull();
  expect(JSON.stringify(detail)).not.toContain("private-");
});

it.each([false, true])(
  "withholds totals when a detail row lacks the measurement (reverse=%s)",
  (reverse) => {
    const measured = row("owner", "platform");
    const missing = { ...row("owner", "platform"), measurements: [] };
    const summary = views.ownerDetailSummary(
      [page(reverse ? [missing, measured] : [measured, missing])],
      "owner",
    );
    expect(summary.funding[0].measurements.customer_cents).toBe("unavailable");
    expect(summary.measurements.customer_cents).toBe("unavailable");
  },
);
it("platform detail certainty comes only from visible customer measurements", () => {
  const detail = views.ownerDetail(
    {
      state: "ok",
      units: ["cents", "customer_cents"],
      groupBy: [],
      asOf: null,
      watermark: null,
      nextCursor: null,
      problem: null,
      rows: [
        {
          key: "private",
          costOwner: "private",
          fundingSource: "platform",
          dimensions: { principal: "owner" },
          cost: { text: "", unit: "cents", certainty: "unknown" },
          certainty: "unknown",
          unknownOperations: "0",
          units: { customer_cents: { text: "2", unit: "customer_cents", certainty: "measured" } },
        },
      ],
    },
    "owner",
    new Map(),
  );
  expect(detail.rows[0].certainty).toBe("measured");
});
