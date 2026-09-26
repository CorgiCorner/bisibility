import { describe, expect, it } from "vitest";
import { allocationBudgets, decimalQuantity, receiptFromEntry, reserveFromEntry } from "./mapping";

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
  it("mirrors both surfaces in the provider native unit as warn", () => {
    const budgets = allocationBudgets(
      "deployment",
      { id: "c1", unit: "units", app: "100", programmatic: "200" },
      3,
    );
    expect(budgets.map((b) => [b.surface, b.unit, b.limit?.value, b.onExceed])).toEqual([
      ["app", "units", 100000000n, "warn"],
      ["programmatic", "units", 200000000n, "warn"],
    ]);
  });
});
