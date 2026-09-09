import { describe, expect, it, vi } from "vitest";
import { researchResultsColumns } from "./research-results-columns";

describe("researchResultsColumns", () => {
  it("declares 4px-scale defaults and only enables descending-first volume sorting", () => {
    const columns = researchResultsColumns({
      canRemoveSaved: true,
      metricsAvailable: true,
      onToggleSave: vi.fn(),
    });
    const keyword = columns.find((column) => column.id === "keyword");
    const volume = columns.find((column) => column.id === "searchVolume");
    const trend = columns.find((column) => column.id === "trend");
    const cpc = columns.find((column) => column.id === "cpcCents");

    expect(columns.map((column) => column.id)).toEqual([
      "keyword",
      "searchVolume",
      "trend",
      "difficulty",
      "cpcCents",
      "intent",
      "source",
    ]);
    expect(keyword).toMatchObject({ minSize: 212, size: 212 });
    expect(keyword?.meta).toMatchObject({ flex: 1.5, lockVisible: true, pin: "left" });
    expect(volume).toMatchObject({ minSize: 92, size: 92, sortDescFirst: true });
    expect(trend).toMatchObject({ minSize: 104, size: 104 });
    expect(cpc).toMatchObject({ minSize: 80, size: 80 });
    expect(columns.filter((column) => column.meta?.sortable === false)).toHaveLength(6);
  });
});
