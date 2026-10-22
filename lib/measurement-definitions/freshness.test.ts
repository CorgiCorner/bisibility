import { describe, expect, it, vi } from "vitest";
import { assignedDefinitionSourceFixture, definitionSourceFixture } from "./fixtures";
import { definitionFreshness } from "./freshness";
import type { DefinitionTransaction } from "./model";

const tx = {} as DefinitionTransaction;
const asOf = new Date("2026-10-01T00:00:00Z");
describe("host-owned freshness policy", () => {
  it("does not invent a manual TTL or make a cadence call for manual mode", async () => {
    const source = definitionSourceFixture();
    source.policy.config!.freshness.manualTtlMs = null;
    const cadenceIntervalMs = vi.fn();
    expect(await definitionFreshness(tx, source, asOf, { cadenceIntervalMs })).toEqual({
      freshForMs: null,
      freshnessReason: "policy_unavailable",
    });
    expect(cadenceIntervalMs).not.toHaveBeenCalled();
  });
  it("uses explicit manual TTL including zero", async () => {
    const source = definitionSourceFixture();
    source.policy.config!.freshness.manualTtlMs = 0;
    expect(
      (await definitionFreshness(tx, source, asOf, { cadenceIntervalMs: vi.fn() })).freshForMs,
    ).toBe(0);
  });
  it("uses manual TTL without membership even when both legacy cadences say daily", async () => {
    const source = definitionSourceFixture();
    source.policy.defaults!.frequency = "daily";
    source.policy.keywordSchedule = {
      ...source.policy.defaults!,
      id: "legacy-keyword",
      frequency: "daily",
    };
    source.policy.config!.freshness.manualTtlMs = 9876;
    const cadenceIntervalMs = vi.fn(async () => 123456);
    expect(await definitionFreshness(tx, source, asOf, { cadenceIntervalMs })).toEqual({
      freshForMs: 9876,
      freshnessReason: null,
    });
    expect(cadenceIntervalMs).not.toHaveBeenCalled();
  });
  it("asks the actual calendar port, then adds only the persisted grace", async () => {
    const source = definitionSourceFixture();
    source.policy.checkSchedule = assignedDefinitionSourceFixture().policy.checkSchedule;
    const cadenceIntervalMs = vi.fn(async () => 123456);
    expect(await definitionFreshness(tx, source, asOf, { cadenceIntervalMs })).toEqual({
      freshForMs: 123777,
      freshnessReason: null,
    });
    expect(cadenceIntervalMs).toHaveBeenCalledWith(tx, source, asOf);
  });
  it("keeps unknown cadence and unsafe arithmetic explicitly unknown", async () => {
    const source = definitionSourceFixture();
    source.policy.checkSchedule = assignedDefinitionSourceFixture().policy.checkSchedule;
    expect(
      (await definitionFreshness(tx, source, asOf, { cadenceIntervalMs: async () => null }))
        .freshnessReason,
    ).toBe("policy_unavailable");
    expect(
      (
        await definitionFreshness(tx, source, asOf, {
          cadenceIntervalMs: async () => Number.MAX_SAFE_INTEGER,
        })
      ).freshnessReason,
    ).toBe("invalid_policy");
  });
});
