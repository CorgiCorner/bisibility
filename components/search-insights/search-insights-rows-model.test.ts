import { SEARCH_INSIGHTS_ROWS_CAP } from "@/lib/search-insights/constants";
import { describe, expect, it } from "vitest";
import { positionClassName, rowsOffset, rowsReach } from "./search-insights-rows-model";

describe("rowsOffset", () => {
  it("starts each page right after the last row of the one before", () => {
    expect(rowsOffset({ page: 1, pageSize: 10 })).toBe(0);
    expect(rowsOffset({ page: 3, pageSize: 25 })).toBe(50);
  });
});

describe("rowsReach", () => {
  it("pages the whole window until the window outgrows the cap", () => {
    expect(rowsReach(1_284)).toBe(1_284);
    expect(rowsReach(SEARCH_INSIGHTS_ROWS_CAP * 4)).toBe(SEARCH_INSIGHTS_ROWS_CAP);
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
