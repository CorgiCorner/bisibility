import { describe, expect, it } from "vitest";
import { scrollFadeWidths } from "./useModelPlaygroundScroll";

const viewport = { left: 16, right: 374 };
describe("column fade geometry", () => {
  it("limits fades to the peeking column at either end", () => {
    expect(
      scrollFadeWidths(viewport, [
        { left: 16, right: 334 },
        { left: 350, right: 668 },
      ]),
    ).toEqual({ start: 0, end: 24 });
    expect(
      scrollFadeWidths(viewport, [
        { left: -278, right: 40 },
        { left: 56, right: 374 },
      ]),
    ).toEqual({ start: 24, end: 0 });
  });
  it("keeps fully visible and single columns free of fades", () => {
    expect(scrollFadeWidths(viewport, [{ left: 16, right: 374 }])).toEqual({ start: 0, end: 0 });
    expect(
      scrollFadeWidths({ left: 16, right: 1424 }, [
        { left: 16, right: 416 },
        { left: 432, right: 832 },
        { left: 848, right: 1248 },
      ]),
    ).toEqual({ start: 0, end: 0 });
  });
  it("leaves gutters and subpixel snap rounding unfaded", () => {
    expect(
      scrollFadeWidths(viewport, [
        { left: -304, right: 14 },
        { left: 30, right: 348 },
      ]),
    ).toEqual({ start: 0, end: 0 });
    expect(scrollFadeWidths(viewport, [{ left: 15.75, right: 374.25 }])).toEqual({
      start: 0,
      end: 0,
    });
  });
});
