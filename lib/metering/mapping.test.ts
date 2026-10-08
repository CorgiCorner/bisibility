import { describe, expect, it, vi } from "vitest";
import type { HostedMeteringSnapshot } from "./hosted-snapshot";
import { entryFromHostedEvidence } from "./hosted-sync";
import { allocationBudgets, decimalQuantity, receiptFromEntry, reserveFromEntry } from "./mapping";

vi.mock("@/lib/providers/execution-extension", () => ({}));
vi.mock("./queued-payload", () => ({}));
vi.mock("./shadow-runtime", () => ({}));

const entry = {
  id: "e1",
  projectId: "p1",
  ownerId: "u1",
  connectionId: "c1",
  provider: "serpapi",
  feature: "rank_check",
  source: "mcp" as const,
  credentialKind: "oauth_client",
  credentialId: "token1",
  correlationId: "trace1",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  costCents: "12.3456",
  usageQuantity: "1.000001",
  measurementStatus: "recorded",
  cached: false,
  failed: false,
};
describe("host metering mapping", () => {
  it.each([
    { costCents: "0.6250", usageQuantity: null, knownUnit: "cents", unknownUnit: "units" },
    { costCents: null, usageQuantity: "1.000000", knownUnit: "units", unknownUnit: "cents" },
  ])(
    "maps independently known hosted $knownUnit without losing the acknowledged debit",
    (proof) => {
      const snapshot: HostedMeteringSnapshot = {
        schemaVersion: 1,
        namespace: "original",
        operationKey: "hosted-execution",
        ownerId: "original-owner",
        walletId: "original-wallet",
        projectId: "original-project",
        connectionId: "original-connection",
        provider: "dataforseo",
        feature: "rank_check",
        source: "app",
        credentialKind: null,
        credentialId: null,
        correlationId: "original-correlation",
        occurredAt: "2026-10-06T00:00:00.000Z",
        estimatedCostCents: "0.6250",
        estimatedPriceCents: "1.0000",
        estimatedQuantity: "1.000000",
        customerPriceVersion: "original-price",
        platformPoolId: "original-pool",
        providerCredentialVersion: "original-version",
        providerCostOwner: "original-provider-account",
      };
      const mapped = entryFromHostedEvidence({
        snapshot,
        costCents: proof.costCents,
        usageQuantity: proof.usageQuantity,
        customerCents: "1.0000",
        cached: false,
        failed: false,
      });
      expect(mapped.measurementStatus).toBe("unknown");
      expect(mapped.costMeasurement).toBe(proof.costCents === null ? "unknown" : "recorded");
      expect(mapped.quantityMeasurement).toBe(
        proof.usageQuantity === null ? "unknown" : "recorded",
      );
      const receipt = receiptFromEntry(mapped, new Date("2026-10-06T00:01:00.000Z"));
      expect(receipt.measurements.find((value) => value.unit === proof.knownUnit)).toMatchObject({
        certainty: "measured",
      });
      expect(receipt.measurements.find((value) => value.unit === proof.unknownUnit)).toEqual({
        unit: proof.unknownUnit,
        certainty: "unknown",
        quantity: null,
      });
      expect(receipt.cost).toEqual(
        proof.costCents === null
          ? { certainty: "unknown", money: null }
          : { certainty: "measured", money: { currency: "USD", units: 6250n } },
      );
      expect(receipt.measurements.find((value) => value.unit === "customer_cents")).toEqual({
        unit: "customer_cents",
        certainty: "measured",
        quantity: { unit: "customer_cents", value: 10000n, scale: 4 },
      });
    },
  );

  it("retains original namespace and independent cost/quantity certainty", () => {
    expect(
      reserveFromEntry("changed", { ...entry, namespace: "original" }, { cents: "1", units: "1" })
        .scope.namespace,
    ).toBe("original");
    const costOnly = receiptFromEntry(
      {
        ...entry,
        measurementStatus: "unknown",
        costMeasurement: "recorded",
        quantityMeasurement: "unknown",
        usageQuantity: null,
      },
      new Date(),
    );
    expect(costOnly.cost.certainty).toBe("measured");
    expect(costOnly.measurements).toMatchObject([
      { unit: "cents", certainty: "measured" },
      { unit: "units", certainty: "unknown", quantity: null },
    ]);
    const quantityOnly = receiptFromEntry(
      {
        ...entry,
        measurementStatus: "unknown",
        costMeasurement: "unknown",
        quantityMeasurement: "recorded",
        costCents: "0",
      },
      new Date(),
    );
    expect(quantityOnly.cost).toEqual({ certainty: "unknown", money: null });
    expect(quantityOnly.measurements).toMatchObject([
      { unit: "cents", certainty: "unknown", quantity: null },
      { unit: "units", certainty: "measured" },
    ]);
  });
  it("preserves decimal precision without converting amounts through number", () => {
    expect(decimalQuantity("999999999999.999999", "units", 6)).toEqual({
      value: 999999999999999999n,
      scale: 6,
      unit: "units",
    });
    expect(() => decimalQuantity("0.00001", "cents", 4)).toThrow();
  });
  it("uses the owner and trusted credential, never the provider secret", () => {
    const input = reserveFromEntry("deployment", entry, { cents: "0.0100", units: "1" });
    expect(input.scope).toEqual({
      namespace: "deployment",
      principal: "u1",
      group: "p1",
      connection: "c1",
      accessCredential: { kind: "oauth_client", id: "token1" },
    });
    expect(input.surface).toBe("programmatic");
    expect(input.estimate[0]?.value).toBe(100n);
    expect(input.fundingSource).toBe("byok");
  });
  it("preserves historical occurrence and unknown certainty", () => {
    expect(receiptFromEntry(entry, new Date("2026-09-24T00:00:00Z"))).toMatchObject({
      cost: { certainty: "measured", money: { units: 123456n } },
      occurredAt: entry.createdAt.toISOString(),
    });
    const unknown = receiptFromEntry(
      { ...entry, measurementStatus: "unknown", costCents: "0", usageQuantity: null },
      new Date(),
    );
    expect(unknown.cost).toEqual({ certainty: "unknown", money: null });
    expect(unknown.measurements.every((m) => m.certainty === "unknown")).toBe(true);
  });
  it("mirrors both surfaces as soft allowances in the provider native unit", () => {
    const budgets = allocationBudgets(
      "deployment",
      { id: "c1", unit: "units", app: "100", programmatic: "200" },
      3,
    );
    expect(budgets.map((b) => [b.surface, b.unit, b.limit?.value, b.onExceed])).toEqual([
      ["app", "units", 100000000n, "allow"],
      ["programmatic", "units", 200000000n, "allow"],
    ]);
  });
  it("separates upstream corrections from the acknowledged customer charge", () => {
    const hosted = {
      ...entry,
      credentialSource: "hosted" as const,
      platformPoolId: "account_1",
      providerCredentialVersion: "credential_v1",
      providerCostOwner: "platform_payer",
      creditAccountRef: "wallet_1",
      customerPriceVersion: "price_v1",
      estimatedPriceCents: "16.0500",
      customerCents: "16.0500",
    };
    const reserved = reserveFromEntry("deployment", hosted, { cents: "12.3456", units: "1" });
    expect(reserved).toMatchObject({
      scope: { principal: "u1" },
      platformPools: ["account_1"],
      costOwner: "platform_payer",
      creditAccountRef: "wallet_1",
      customerPriceVersion: "price_v1",
    });
    expect(reserved.estimate.find((q) => q.unit === "customer_cents")).toEqual(
      decimalQuantity("16.0500", "customer_cents", 4),
    );
    const corrected = receiptFromEntry({ ...hosted, costCents: "20.0000" }, new Date());
    expect(corrected.cost.money?.units).toBe(200000n);
    expect(corrected.measurements.find((m) => m.unit === "customer_cents")?.quantity?.value).toBe(
      160500n,
    );
    const pendingDebit = receiptFromEntry({ ...hosted, customerCents: null }, new Date());
    expect(pendingDebit.cost.certainty).toBe("measured");
    expect(pendingDebit.measurements.find((m) => m.unit === "customer_cents")).toEqual({
      unit: "customer_cents",
      certainty: "unknown",
      quantity: null,
    });
    expect(() =>
      reserveFromEntry(
        "deployment",
        { ...hosted, platformPoolId: undefined },
        { cents: "1", units: "1" },
      ),
    ).toThrow("retained account");
  });
});
