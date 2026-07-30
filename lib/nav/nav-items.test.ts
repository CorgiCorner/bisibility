import { describe, expect, it } from "vitest";
import { navItems } from "./nav-items";

describe("navItems", () => {
  it("keeps the primary discovery flow first and preserves the remaining order", () => {
    expect(navItems("prj_example").map((item) => item.label)).toEqual([
      "Overview",
      "Research",
      "Keywords",
      "Backlinks",
      "Checks",
      "Integrations",
      "Competitors",
      "Timeline",
      "Alerts",
      "Settings",
    ]);
  });
});
