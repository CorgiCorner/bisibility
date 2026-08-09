import { describe, expect, it } from "vitest";
import { filterChipStateClassName } from "./filter-chip-styles";

describe("filterChipStateClassName", () => {
  it("uses a soft accent for selected filters", () => {
    const className = filterChipStateClassName(true);

    expect(className).toContain("bg-accent-soft");
    expect(className).toContain("text-accent-text");
    expect(className).not.toContain("bg-accent ");
    expect(className).not.toContain("text-white");
  });

  it("keeps unselected filters neutral", () => {
    const className = filterChipStateClassName(false);

    expect(className).toContain("bg-bg-elev");
    expect(className).toContain("text-fg-muted");
  });
});
