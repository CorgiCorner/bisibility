import type { AccessContext, BudgetStatus, Meter, ReserveInput } from "@usagekit/core";
import { describe, expect, it, vi } from "vitest";
import { readShadowDecision } from "./shadow-probe";

const access = { namespace: "test", readablePrincipals: "*" } as AccessContext;
const input = {
  scope: { namespace: "test", principal: "u", connection: "c" },
  surface: "app",
  estimate: [{ unit: "cents", value: 12345n, scale: 4 }],
} as unknown as ReserveInput;
function fixture(statuses: BudgetStatus[]) {
  const applicableBudgets = vi.fn().mockResolvedValue({ outcome: "ok", value: statuses });
  return { applicableBudgets, meter: { applicableBudgets } as unknown as Meter };
}
const status = (value: bigint, scale: number, limit = true): BudgetStatus =>
  ({
    budget: { unit: "cents", limit: limit ? { unit: "cents", value: 10n, scale: 0 } : null },
    remaining: { unit: "cents", value, scale },
  }) as BudgetStatus;
describe("read-only shadow admission observation", () => {
  it("compares exact scaled quantities using one read and no command", async () => {
    const f = fixture([status(1234n, 3)]);
    expect(await readShadowDecision(f.meter, access, input)).toBe("exceeded");
    expect(f.applicableBudgets).toHaveBeenCalledExactlyOnceWith(access, {
      scope: input.scope,
      surface: "app",
      units: ["cents"],
      platformPools: undefined,
    });
  });
  it("allows exact headroom and unbounded limits", async () => {
    const f = fixture([status(12345n, 4), status(0n, 0, false)]);
    expect(await readShadowDecision(f.meter, access, input)).toBe("reserved");
  });
  it("does not interpret unavailable bounded figures or missing units as zero", async () => {
    for (const s of [
      { ...status(1n, 0), remaining: null },
      { ...status(1n, 0), budget: { ...status(1n, 0).budget, unit: "requests" } },
    ]) {
      expect(await readShadowDecision(fixture([s]).meter, access, input)).toBe("invalid");
    }
  });
  it("surfaces read refusal to the shadow failure boundary", async () => {
    const f = fixture([]);
    f.applicableBudgets.mockResolvedValue({ outcome: "forbidden" });
    await expect(readShadowDecision(f.meter, access, input)).rejects.toThrow(
      "Shadow budgets unavailable",
    );
  });
});
