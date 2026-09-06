import { describe, expect, it } from "vitest";
import {
  HEADER_SPEND_CAP_TOOLTIP,
  headerNoCapAriaLabel,
  headerNoCapLabel,
} from "./header-spend-cap-copy";

describe("header spend cap copy", () => {
  it("uses budget language in the tooltip", () => {
    expect(HEADER_SPEND_CAP_TOOLTIP).toBe("Monthly provider budget.");
  });

  it("names the no-budget pill with a set action", () => {
    expect(headerNoCapLabel(0)).toBe("No budget · Set one");
    expect(headerNoCapAriaLabel(0)).toBe("No budget, set one");
  });

  it("puts spend before the no-budget call to action when spend exists", () => {
    expect(headerNoCapLabel(1246)).toBe("$12.46 · no budget · Set one");
    expect(headerNoCapAriaLabel(1246)).toBe("$12.46 spent with no budget, set one");
  });
});
