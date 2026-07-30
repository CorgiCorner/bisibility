import { describe, expect, it } from "vitest";
import { renderedRowHeightForDensity } from "./grid-density";

describe("renderedRowHeightForDensity", () => {
  it("keeps compact rows dense without crowding two-line keyword cells", () => {
    expect(renderedRowHeightForDensity("compact")).toBe(56);
    expect(renderedRowHeightForDensity("standard")).toBe(68);
    expect(renderedRowHeightForDensity("comfortable")).toBe(78);
  });
});
