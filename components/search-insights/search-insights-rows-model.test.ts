import { SEARCH_INSIGHTS_ROWS_CAP } from "@/lib/search-insights/constants";
import { describe, expect, it } from "vitest";
import { SHOW_CAP_LABEL, SHOW_CAP_TITLE, SHOW_MORE_TITLE } from "./search-insights-copy";
import {
  collapseLabel,
  counterLabel,
  moreLabel,
  moreTitle,
  nextShow,
  positionClassName,
  reachLabel,
  rowsReach,
  visibleRows,
} from "./search-insights-rows-model";

describe("nextShow", () => {
  it("walks ten to fifty to everything", () => {
    expect(nextShow(10)).toBe(50);
    expect(nextShow(50)).toBe("all");
  });
});

describe("moreLabel", () => {
  it("offers more rows, then all of them, then nothing", () => {
    expect(moreLabel(10, 1_284)).toBe("Show more");
    expect(moreLabel(50, 1_284)).toBe("Show all 1,284");
    expect(moreLabel("all", 1_284)).toBeNull();
  });

  it("stops offering a step the window cannot fill", () => {
    expect(moreLabel(10, 8)).toBeNull();
    expect(moreLabel(50, 32)).toBeNull();
  });

  it("does not promise all of a window too big for one table", () => {
    const saturated = SEARCH_INSIGHTS_ROWS_CAP * 4;

    expect(moreLabel(50, saturated)).toBe(SHOW_CAP_LABEL);
    expect(moreLabel(50, saturated)).not.toContain("all");
    expect(moreTitle(50, saturated)).toBe(SHOW_CAP_TITLE);
    // The first step is the same ten to fifty either way, so it keeps the plain sentence.
    expect(moreTitle(10, saturated)).toBe(SHOW_MORE_TITLE);
  });
});

describe("reachLabel", () => {
  it("stops offering once the rows already reach the cap, so the control cannot go dead", () => {
    expect(reachLabel(50, 1_284, SEARCH_INSIGHTS_ROWS_CAP)).toBe("Show all 1,284");
    expect(
      reachLabel(SEARCH_INSIGHTS_ROWS_CAP, SEARCH_INSIGHTS_ROWS_CAP * 4, SEARCH_INSIGHTS_ROWS_CAP),
    ).toBeNull();
    expect(reachLabel(12, 12, SEARCH_INSIGHTS_ROWS_CAP)).toBeNull();
  });
});

describe("rowsReach", () => {
  it("expands to the whole window until the window outgrows the cap", () => {
    expect(rowsReach(1_284)).toBe(1_284);
    expect(rowsReach(SEARCH_INSIGHTS_ROWS_CAP * 4)).toBe(SEARCH_INSIGHTS_ROWS_CAP);
  });
});

describe("counter and footer", () => {
  it("counts what is on screen against what the window holds", () => {
    expect(counterLabel(10, 1_284)).toBe("10 of 1,284");
    expect(counterLabel(184, 184)).toBe("184 of 184");
  });

  it("turns the counter into the way back only once it has expanded", () => {
    expect(collapseLabel(10)).toBeNull();
    expect(collapseLabel(50)).toBe("Show top 10");
    expect(collapseLabel("all")).toBe("Show top 10");
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
