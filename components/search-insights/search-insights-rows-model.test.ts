import { SEARCH_INSIGHTS_ROWS_CAP } from "@/lib/search-insights/constants";
import { describe, expect, it } from "vitest";
import { nextShow, positionClassName, rowsReach, visibleRows } from "./search-insights-rows-model";

describe("nextShow", () => {
  it("walks ten to fifty to everything", () => {
    expect(nextShow(10)).toBe(50);
    expect(nextShow(50)).toBe("all");
  });
});

describe("rowsReach", () => {
  it("expands to the whole window until the window outgrows the cap", () => {
    expect(rowsReach(1_284)).toBe(1_284);
    expect(rowsReach(SEARCH_INSIGHTS_ROWS_CAP * 4)).toBe(SEARCH_INSIGHTS_ROWS_CAP);
  });
});

describe("visibleRows", () => {
  const rows = [1, 2, 3, 4, 5];

  it("shows the requested slice, and everything once expanded", () => {
    expect(visibleRows(rows, 3)).toEqual([1, 2, 3]);
    expect(visibleRows(rows, "all")).toEqual(rows);
  });
});

describe("positionClassName", () => {
  it("treats position as a rank bucket, never as a status colour", () => {
    expect(positionClassName(4.2)).toBe("text-fg");
    expect(positionClassName(10)).toBe("text-fg");
    expect(positionClassName(18.4)).toBe("text-fg-muted");
    expect(positionClassName(64)).toBe("text-fg-muted");
  });
});
