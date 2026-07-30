import { describe, expect, it } from "vitest";
import {
  chronologicalTrend,
  deeperResearchCostCents,
  intentChipMeta,
} from "./research-results-model";

describe("chronologicalTrend", () => {
  it("reorders provider newest-first months oldest-first across a year boundary", () => {
    const sorted = chronologicalTrend([
      { month: 2, searchVolume: 400, year: 2026 },
      { month: 12, searchVolume: 300, year: 2025 },
      { month: 1, searchVolume: 350, year: 2026 },
      { month: 11, searchVolume: 280, year: 2025 },
    ]);
    expect(sorted.map((point) => `${point.month}/${point.year}`)).toEqual([
      "11/2025",
      "12/2025",
      "1/2026",
      "2/2026",
    ]);
  });
});

describe("intentChipMeta", () => {
  it("maps intents to the short design labels and skips unknown values", () => {
    expect(intentChipMeta("commercial")?.label).toBe("Comm");
    expect(intentChipMeta("informational")?.label).toBe("Info");
    expect(intentChipMeta("navigational")?.label).toBe("Nav");
    expect(intentChipMeta("transactional")?.label).toBe("Trans");
    expect(intentChipMeta("unknown")).toBeNull();
    expect(intentChipMeta(null)).toBeNull();
  });
});

describe("deeperResearchCostCents", () => {
  const sources = (["related", "suggestion", "idea"] as const).map((source) => ({
    cached: false,
    costCents: 0,
    returned: 10,
    source,
    status: "ok" as const,
  }));

  it("prefers the server estimate and treats cached runs as free", () => {
    const result = { connections: [], sources };
    expect(deeperResearchCostCents(result, 500, { cached: false, costCents: 9 })).toBe(9);
    expect(deeperResearchCostCents(result, 500, { cached: true, costCents: 9 })).toBe(0);
  });

  it("falls back to the provider rate list so the price stays visible", () => {
    const result = {
      connections: [{ id: "c1", label: "DataForSEO", provider: "dataforseo" }],
      sources,
    };
    // Three sources, each base 1 cent + 0.01 cent per item at 500 items.
    expect(deeperResearchCostCents(result, 500)).toBe(18);
    expect(deeperResearchCostCents({ ...result, connections: [] }, 500)).toBeNull();
  });
});
