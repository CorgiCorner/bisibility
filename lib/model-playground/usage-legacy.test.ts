import { aiUsageReceipt } from "@/lib/ai-research/provider-receipt";
import { receiptFromEntry } from "@/lib/metering/mapping";
import type { DataForSeoResponse } from "@/lib/providers/serp/dataforseo-payload";
import { describe, expect, it } from "vitest";

describe("unchanged legacy native receipt interpretation", () => {
  it.each([
    {
      label: "reported fractional cents",
      cost: 0.000123,
      envelope: 0.000123,
      quantity: 1,
      cents: 0.0123,
    },
    { label: "reported zero", cost: 0, envelope: 0, quantity: 1, cents: 0 },
    { label: "missing cost", cost: undefined, envelope: undefined, quantity: null, cents: null },
    { label: "conflicting envelope", cost: 1, envelope: 2, quantity: null, cents: null },
    { label: "negative cost", cost: -1, envelope: -1, quantity: null, cents: null },
    {
      label: "nonfinite cost",
      cost: Number.NaN,
      envelope: Number.NaN,
      quantity: null,
      cents: null,
    },
  ])("$label", ({ cost, envelope, quantity, cents }) => {
    const data = {
      status_code: 20000,
      cost: envelope,
      tasks: [{ id: "legacy-task", status_code: 20000, cost }],
    } as DataForSeoResponse;
    expect(aiUsageReceipt(data, { ok: true })).toEqual({
      cached: false,
      failed: false,
      providerRequestId: "legacy-task",
      quantity,
      costCents: cents,
    });
    expect(aiUsageReceipt(data, { ok: false })).toEqual({
      cached: false,
      failed: true,
      providerRequestId: "legacy-task",
      quantity,
      costCents: cents,
    });
  });
  it.each(["recorded", "unknown"])("legacy Meter mapping remains %s", (status) => {
    const entry = {
      id: "legacy",
      ownerId: "owner",
      projectId: "project",
      connectionId: "connection",
      provider: "dataforseo",
      feature: "rank_check",
      source: "app" as const,
      createdAt: new Date("2026-11-11T00:00:00Z"),
      costCents: "0.0123",
      usageQuantity: "1",
      measurementStatus: status,
      cached: false,
      failed: false,
    };
    const receipt = receiptFromEntry(entry, entry.createdAt);
    expect(receipt.cost).toEqual(
      status === "recorded"
        ? { certainty: "measured", money: { units: 123n, currency: "USD" } }
        : { certainty: "unknown", money: null },
    );
    expect(receipt.measurements.map((m) => m.certainty)).toEqual(
      status === "recorded" ? ["measured", "measured"] : ["unknown", "unknown"],
    );
  });
});
