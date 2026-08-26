import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { describe, expect, it } from "vitest";
import { primaryEligibleMeteredConnection, resolveEffectiveAllocations } from "./compatibility";
import type { AllocationConnection } from "./types";
import { validateProviderAllocation } from "./validation";

const catalog = [
  {
    allocation: {
      allocationUnit: "cents",
      billing: "metered",
      kind: "billable",
      quotaReset: "none",
    },
    defaultStatus: "ready",
    id: "metered-b",
    kind: "serp",
    label: "Metered B",
  },
  {
    allocation: {
      allocationUnit: "cents",
      billing: "metered",
      kind: "billable",
      quotaReset: "none",
    },
    defaultStatus: "ready",
    id: "metered-a",
    kind: "serp",
    label: "Metered A",
  },
  {
    allocation: {
      allocationUnit: "units",
      billing: "quota",
      kind: "billable",
      quotaReset: "calendar_month",
    },
    defaultStatus: "ready",
    id: "quota",
    kind: "serp",
    label: "Quota",
  },
  {
    allocation: { kind: "non_billable" },
    defaultStatus: "optional",
    id: "free",
    kind: "analytics",
    label: "Free",
  },
] as const satisfies readonly ProviderCatalogEntry[];

const connection = (overrides: Partial<AllocationConnection>): AllocationConnection => ({
  allocationAmountPerMonth: null,
  allocationUnit: null,
  enabled: true,
  id: "conn",
  priority: 100,
  provider: "metered-a",
  status: "connected",
  ...overrides,
});

describe("provider allocation compatibility", () => {
  it("chooses one eligible metered primary by priority, provider, then id", () => {
    const primary = primaryEligibleMeteredConnection(
      [
        connection({ id: "later", provider: "metered-b", priority: 10 }),
        connection({ id: "z", provider: "metered-a", priority: 10 }),
        connection({ id: "a", provider: "metered-a", priority: 10 }),
        connection({ id: "disabled", enabled: false, priority: 1 }),
        connection({ id: "disconnected", status: "needs_reauth", priority: 1 }),
        connection({ id: "quota", provider: "quota", priority: 1 }),
        connection({ id: "free", provider: "free", priority: 1 }),
      ],
      catalog,
    );
    expect(primary?.id).toBe("a");
  });

  it("uses the legacy cap only before initialization and only on the primary", () => {
    const connections = [
      connection({ id: "primary" }),
      connection({ id: "other", provider: "metered-b" }),
    ];
    expect(
      resolveEffectiveAllocations({
        catalog,
        connections,
        project: { budgetCapCents: 5000, providerAllocationsInitializedAt: null },
      }),
    ).toEqual([
      {
        allocation: { amountPerMonth: 5000, unit: "cents" },
        internalConnectionId: "primary",
        source: "legacy_project",
      },
      { allocation: null, internalConnectionId: "other", source: "none" },
    ]);
    expect(
      resolveEffectiveAllocations({
        catalog,
        connections,
        project: { budgetCapCents: 5000, providerAllocationsInitializedAt: new Date(0) },
      }).every((value) => value.source === "none"),
    ).toBe(true);
  });

  it("lets connection allocation win over the legacy fallback", () => {
    const values = resolveEffectiveAllocations({
      catalog,
      connections: [connection({ allocationAmountPerMonth: 7000, allocationUnit: "cents" })],
      project: { budgetCapCents: 5000, providerAllocationsInitializedAt: null },
    });
    expect(values[0]).toMatchObject({ allocation: { amountPerMonth: 7000 }, source: "connection" });
  });

  it("keeps first and later connections uncapped for initialized new or imported projects", () => {
    const values = resolveEffectiveAllocations({
      catalog,
      connections: [
        connection({ id: "first" }),
        connection({ id: "later", provider: "metered-b" }),
      ],
      project: { budgetCapCents: 5000, providerAllocationsInitializedAt: new Date() },
    });
    expect(values).toEqual([
      { allocation: null, internalConnectionId: "first", source: "none" },
      { allocation: null, internalConnectionId: "later", source: "none" },
    ]);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER, 2_147_483_648])(
    "rejects invalid amount %s",
    (amountPerMonth) => {
      expect(() =>
        validateProviderAllocation(catalog, "metered-a", { amountPerMonth, unit: "cents" }),
      ).toThrow(RangeError);
    },
  );

  it("rejects unit mismatch, non-billable allocation, and unknown providers", () => {
    expect(() =>
      validateProviderAllocation(catalog, "metered-a", { amountPerMonth: 1, unit: "units" }),
    ).toThrow(TypeError);
    expect(() =>
      validateProviderAllocation(catalog, "free", { amountPerMonth: 1, unit: "units" }),
    ).toThrow(TypeError);
    expect(() => validateProviderAllocation(catalog, "missing", null)).toThrow(TypeError);
  });
});
