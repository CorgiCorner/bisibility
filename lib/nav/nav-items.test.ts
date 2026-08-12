import { describe, expect, it } from "vitest";
import { navItems } from "./nav-items";

describe("navItems", () => {
  it("keeps the primary discovery flow first and preserves the remaining order", () => {
    expect(navItems("prj_example").map((item) => item.label)).toEqual([
      "Overview",
      "Keyword Research",
      "Rank Tracker",
      "Backlinks",
      "Checks",
      "Competitors",
      "Timeline",
      "Integrations",
      "Alerts",
      "Settings",
    ]);
  });

  it("groups the day-to-day flow as primary and the set-up-once surfaces as utility", () => {
    const items = navItems("prj_example");

    expect(items.filter((item) => item.group !== "utility").map((item) => item.label)).toEqual([
      "Overview",
      "Keyword Research",
      "Rank Tracker",
      "Backlinks",
      "Checks",
      "Competitors",
      "Timeline",
    ]);
    expect(items.filter((item) => item.group === "utility").map((item) => item.label)).toEqual([
      "Integrations",
      "Alerts",
      "Settings",
    ]);
    expect(items.find((item) => item.label === "Rank Tracker")?.href).toBe(
      "/app/prj_example/rank-tracker",
    );
  });
});
