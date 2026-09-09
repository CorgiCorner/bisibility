import { describe, expect, it } from "vitest";
import { distributeDataTableWidths, normalizeDataTableSize } from "./data-table-sizing";

describe("data table sizing", () => {
  it("rounds to the 4px scale and clamps to column bounds", () => {
    expect(normalizeDataTableSize(101, 64, 120)).toBe(100);
    expect(normalizeDataTableSize(42, 64, 120)).toBe(64);
    expect(normalizeDataTableSize(142, 64, 120)).toBe(120);
  });

  it("distributes leftover width by flex weight", () => {
    expect(
      distributeDataTableWidths(
        [
          { flex: 1, id: "keyword", size: 100 },
          { flex: 2, id: "description", size: 100 },
          { id: "actions", size: 100 },
        ],
        600,
        {},
      ),
    ).toEqual({ actions: 100, description: 300, keyword: 200 });
  });

  it("stops stretching a column after it has a user size", () => {
    expect(
      distributeDataTableWidths(
        [
          { flex: 1, id: "keyword", size: 100 },
          { flex: 1, id: "description", size: 100 },
        ],
        400,
        { keyword: 120 },
      ),
    ).toEqual({ description: 280, keyword: 120 });
  });

  it("allocates rounded flex shares without exceeding the remaining budget", () => {
    const equal = distributeDataTableWidths(
      [
        { flex: 1, id: "first", size: 64 },
        { flex: 1, id: "second", size: 64 },
      ],
      132,
      {},
    );
    const unevenWithMax = distributeDataTableWidths(
      [
        { flex: 3, id: "capped", maxSize: 68, size: 64 },
        { flex: 1, id: "remaining", size: 64 },
      ],
      148,
      {},
    );

    expect(equal).toEqual({ first: 68, second: 64 });
    expect(Object.values(equal).reduce((sum, width) => sum + width, 0)).toBe(132);
    expect(unevenWithMax).toEqual({ capped: 68, remaining: 80 });
  });
});
