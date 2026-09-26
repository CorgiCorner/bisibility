import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { describe, expect, it } from "vitest";
import { validateProviderConnectionAllocations } from "./validation";

const catalog = [
  {
    allocation: {
      allocationUnit: "cents",
      billing: "metered",
      kind: "billable",
      quotaReset: "none",
    },
    defaultStatus: "ready",
    id: "metered",
    kind: "serp",
    label: "Metered",
  },
  {
    allocation: {
      allocationUnit: "units",
      billing: "quota",
      kind: "billable",
      quotaReset: "billing_cycle",
    },
    defaultStatus: "ready",
    id: "quota",
    kind: "serp",
    label: "Quota",
  },
] as const satisfies readonly ProviderCatalogEntry[];

describe("validateProviderConnectionAllocations", () => {
  it("validates each side with the provider allocation rules", () => {
    expect(() =>
      validateProviderConnectionAllocations(catalog, "quota", {
        app: { amountPerMonth: 5, unit: "units" },
        programmatic: { amountPerMonth: 3, unit: "units" },
      }),
    ).not.toThrow();
    expect(() =>
      validateProviderConnectionAllocations(catalog, "quota", {
        app: null,
        programmatic: null,
      }),
    ).not.toThrow();
  });

  it("rejects an amount outside the catalog or unit rules on either side", () => {
    expect(() =>
      validateProviderConnectionAllocations(catalog, "quota", {
        app: { amountPerMonth: 0, unit: "units" },
        programmatic: null,
      }),
    ).toThrow(RangeError);
    expect(() =>
      validateProviderConnectionAllocations(catalog, "quota", {
        app: null,
        programmatic: { amountPerMonth: 3, unit: "cents" },
      }),
    ).toThrow(TypeError);
  });

  it("rejects both sides set with different units", () => {
    expect(() =>
      validateProviderConnectionAllocations(catalog, "metered", {
        app: { amountPerMonth: 2500, unit: "cents" },
        programmatic: { amountPerMonth: 100, unit: "units" },
      }),
    ).toThrow(TypeError("App and programmatic allocations must share one unit."));
  });

  it("skips the programmatic side when the update keeps the stored value", () => {
    expect(() =>
      validateProviderConnectionAllocations(catalog, "metered", {
        app: { amountPerMonth: 2500, unit: "cents" },
      }),
    ).not.toThrow();
  });
});
