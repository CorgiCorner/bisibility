import * as usage from "@/lib/model-playground/usage";
import {
  binding,
  measuredResult,
  present,
  pricedBinding,
  reportedResult,
} from "@/lib/model-playground/usage.test-support";
import {
  bindModelUsageEvidence,
  loadModelUsageEvidence,
  persistModelUsageEvidence,
} from "@/lib/model-playground/usage-storage";
import { usageStorageHarness } from "@/lib/model-playground/usage-storage.test-support";
import { describe, expect, it, vi } from "vitest";
import {
  modelUsageAdvisoryMeasurements,
  modelUsageMeasurements,
  modelUsageMeterReceipt,
} from "./model-usage";

const f = usageStorageHarness();
const companion = "Meter companion required for native usage settlement independent of money.";
async function retained(b = binding(), response: ReturnType<typeof measuredResult> | null = null) {
  await f.transaction(async (tx) => {
    await bindModelUsageEvidence(tx, "attempt-1", b);
    await persistModelUsageEvidence(tx, "attempt-1", response);
  });
  return present(await loadModelUsageEvidence(f.tx, "attempt-1", b.projectId));
}

describe("native model Meter mapping", () => {
  it("refuses to settle a canonical native request twice", async () => {
    const loaded = await retained(binding(), reportedResult("0.000123"));
    expect(() =>
      modelUsageMeterReceipt({ ...loaded, canonicalId: "attempt-1", counted: false }, new Date()),
    ).toThrow("Duplicate native request cannot settle again.");
  });
  it("maps measured quantities separately from advisory estimates and vendor spend", async () => {
    const loaded = await retained(pricedBinding(), measuredResult());
    const receipt = present(loaded.receipt);
    const measurements = modelUsageMeasurements(receipt);
    expect(measurements).toContainEqual({
      unit: "input_tokens",
      certainty: "measured",
      quantity: { unit: "input_tokens", value: 100n, scale: 0 },
    });
    expect(modelUsageAdvisoryMeasurements(receipt)).toEqual([
      {
        unit: "budget_cents",
        certainty: "estimated",
        quantity: { unit: "budget_cents", value: 131n, scale: 4 },
      },
    ]);
    expect(measurements.some((m) => m.unit === "cents" || m.unit === "budget_cents")).toBe(false);
    expect(() => modelUsageMeterReceipt(loaded, new Date())).toThrow(companion);
  });
  it("keeps incomplete native dimensions unknown and refuses monetary settlement", async () => {
    const loaded = await retained();
    expect(modelUsageMeasurements(present(loaded.receipt))).toContainEqual({
      unit: "input_tokens",
      quantity: null,
      certainty: "unknown",
    });
    expect(() => modelUsageMeterReceipt(loaded, new Date())).toThrow(companion);
  });
  it("maps a complete reported total in exact fractional cents", async () => {
    const loaded = await retained(binding(), reportedResult("0.000123"));
    const mapped = modelUsageMeterReceipt(loaded, new Date("2026-11-12T00:00:00Z"));
    expect(mapped.cost).toEqual({ certainty: "measured", money: { units: 123n, currency: "USD" } });
    expect(mapped.measurements.find((m) => m.unit === "cents")?.quantity?.value).toBe(123n);
    expect(mapped.id).toBe(modelUsageMeterReceipt(loaded, new Date()).id);
  });
  it("preserves finer receipts but refuses lossy Meter money precision", async () => {
    const loaded = await retained(binding(), reportedResult());
    expect(loaded.receipt?.monetary.total?.amount).toBe("0.00012345");
    expect(() => modelUsageMeterReceipt(loaded, new Date())).toThrow("Metering precision exceeded");
  });
  it("refuses subtotal money even when quantities are complete", async () => {
    const response = reportedResult();
    present(response.costEvidence.providerReported).scope.kind = "subtotal";
    const loaded = await retained(binding(), response);
    expect(() => modelUsageMeterReceipt(loaded, new Date())).toThrow(companion);
  });
  it("reaches the mapping guard for forged estimated money independently of validation", async () => {
    const loaded = await retained(pricedBinding(), measuredResult());
    const receipt = present(loaded.receipt);
    receipt.monetary = {
      status: "reported",
      total: {
        ...reportedResult().providerCost,
        certainty: "estimated",
        basis: "rate_card",
        rateCardVersion: "rates-v1",
      },
    };
    // Receipt integrity has separate tests; isolate this mapping-level defence.
    const validation = vi.spyOn(usage, "validateModelUsageReceipt").mockReturnValue(receipt);
    try {
      expect(() => modelUsageMeterReceipt(loaded, new Date())).toThrow(
        "Only provider-reported totals may settle native money.",
      );
      expect(validation).toHaveBeenCalledOnce();
    } finally {
      validation.mockRestore();
    }
  });
});
