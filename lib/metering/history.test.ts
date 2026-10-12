import { describe, expect, it } from "vitest";
import { historicalOperation } from "./history-mapping";
import { source } from "./history-test-data";

describe("historical accounting projection", () => {
  it("retains exact rate evidence and normalization inputs without granting dispatch", () => {
    const op = historicalOperation(source(), "test", "2026-10-10T00:00:00.000Z");
    expect(op).toMatchObject({
      state: "settled",
      lease: null,
      budgetEpochs: [],
      scope: { principal: "historical-unattributed:project", group: "project" },
    });
    expect(op.receipts[0]).toMatchObject({
      evidenceRef: expect.any(String),
      cost: { money: { units: 12345n } },
    });
    expect(op.receipts[0]?.metadata).toMatchObject({
      legacy: {
        unitCostCents: "0.6172",
        costCents: "1.2345",
        usageQuantity: "2.000000",
        feature: "ranked_keywords",
      },
    });
    expect(op.estimate).toEqual([]);
  });
  it("does not infer original provider, source or payer from current connection ownership", () => {
    const op = historicalOperation(
      source({ provider: null, source: null }),
      "test",
      "2026-10-10T00:00:00.000Z",
    );
    expect(op).toMatchObject({ provider: "historical-unknown", source: "import", surface: "app" });
    expect(op.receipts[0]?.metadata).toMatchObject({ legacy: { provider: null, source: null } });
  });
  it("unknown cost stays pending and absent estimates do not become zero", () => {
    const op = historicalOperation(
      source({ measurementStatus: "unknown", costCents: "0.0000" }),
      "test",
      "2026-10-10T00:00:00.000Z",
    );
    expect(op.state).toBe("pending");
    expect(op.receipts[0]?.cost).toEqual({ certainty: "unknown", money: null });
    expect(op.estimate).toEqual([]);
  });
  it("a historical hosted price is unknown without a retained wallet debit", () => {
    const op = historicalOperation(
      source({ credentialSource: "hosted", priceCents: "0.0000" }),
      "test",
      "2026-10-10T00:00:00.000Z",
    );
    expect(op.state).toBe("pending");
    expect(
      op.receipts[0]?.measurements.find((m) => m.unit === "customer_cents")?.quantity,
    ).toBeNull();
  });
  it("cached history retains classification with zero consumption", () => {
    const op = historicalOperation(source({ cached: true }), "test", "2026-10-10T00:00:00.000Z");
    expect(op.receipts[0]?.cached).toBe(true);
    expect(op.receipts[0]?.measurements.every((m) => m.quantity?.value === 0n)).toBe(true);
  });
});
it("native duplicates preserve provenance with zero consumption", () => {
  const op = historicalOperation(source(), "test", "2026-10-10T00:00:00.000Z", {
    canonicalId: "canonical",
  });
  expect(op.receipts[0]?.cost.money?.units).toBe(0n);
  expect(op.receipts[0]?.providerRequestId).toBeUndefined();
  expect(op.receipts[0]?.metadata.legacy.providerRequestId).toBe("native");
});
