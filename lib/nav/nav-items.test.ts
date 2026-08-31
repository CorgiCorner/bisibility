import { describe, expect, it } from "vitest";
import { landingSegments, navItemGroups, navItems } from "./nav-items";

describe("navItems", () => {
  it("keeps the grouped rail in its settled flat order", () => {
    expect(navItems("prj_example").map((item) => item.label)).toEqual([
      "Dashboard",
      "Search Console",
      "Rank Tracker",
      "Competitors",
      "Timeline",
      "Keyword Research",
      "Domain Overview",
      "Backlinks",
      "Integrations",
      "Install",
      "Alerts",
      "Settings",
    ]);
  });

  it("assigns every rail row to its settled group", () => {
    const items = navItems("prj_example");

    expect(navItemGroups).toEqual([
      { id: "track", label: "Track" },
      { id: "research", label: "Research" },
      { id: "connect", label: "Connect" },
    ]);
    expect(items.filter((item) => item.group === "top").map((item) => item.label)).toEqual([
      "Dashboard",
      "Search Console",
    ]);
    expect(items.filter((item) => item.group === "track").map((item) => item.label)).toEqual([
      "Rank Tracker",
      "Competitors",
      "Timeline",
    ]);
    expect(items.filter((item) => item.group === "research").map((item) => item.label)).toEqual([
      "Keyword Research",
      "Domain Overview",
      "Backlinks",
    ]);
    expect(items.filter((item) => item.group === "connect").map((item) => item.label)).toEqual([
      "Integrations",
      "Install",
    ]);
    expect(items.filter((item) => item.group === "utility").map((item) => item.label)).toEqual([
      "Alerts",
      "Settings",
    ]);
  });

  it("adds Install to Connect without making it a landing preference", () => {
    const items = navItems("prj_example");
    const install = items.find((item) => item.label === "Install");
    const integrations = items.find((item) => item.label === "Integrations");

    expect(install).toMatchObject({
      group: "connect",
      href: "/app/prj_example/install",
    });
    expect(install?.icon.displayName).toBe("SparkleIcon");
    expect(integrations?.group).toBe("connect");
    expect(items.find((item) => item.label === "Integrations")?.group).not.toBe("utility");
  });

  it("keeps the hrefs whose segment does not follow from the label", () => {
    const items = navItems("prj_example");

    const gcsInsights = items.find((item) => item.label === "Search Console");
    expect(gcsInsights?.href).toBe("/app/prj_example/search-console");
    expect(gcsInsights?.icon.displayName).toBe("GoogleLogoIcon");
    expect(items.find((item) => item.label === "Rank Tracker")?.href).toBe(
      "/app/prj_example/rank-tracker",
    );
    expect(items.find((item) => item.label === "Rank Tracker")?.icon.displayName).toBe(
      "RankingIcon",
    );
  });

  it("uses the history clock icon for Timeline", () => {
    expect(
      navItems("prj_example").find((item) => item.label === "Timeline")?.icon.displayName,
    ).toBe("ClockCounterClockwiseIcon");
  });

  it("uses the siren icon for Alerts", () => {
    expect(navItems("prj_example").find((item) => item.label === "Alerts")?.icon.displayName).toBe(
      "SirenIcon",
    );
  });

  it("assigns module tags only to the designated entries", () => {
    expect(
      Object.fromEntries(navItems("prj_example").map((item) => [item.label, item.badge])),
    ).toEqual({
      Dashboard: undefined,
      "Search Console": "alpha",
      "Rank Tracker": undefined,
      Competitors: "experimental",
      Timeline: "experimental",
      "Keyword Research": undefined,
      "Domain Overview": undefined,
      Backlinks: undefined,
      Integrations: undefined,
      Install: undefined,
      Alerts: "alpha",
      Settings: undefined,
    });
  });

  it("keeps landing preferences to their original eight route segments", () => {
    expect(landingSegments).toEqual([
      "dashboard",
      "search-console",
      "keyword-research",
      "domain-overview",
      "rank-tracker",
      "backlinks",
      "competitors",
      "timeline",
    ]);
    expect(landingSegments).not.toContain("install");
    expect(landingSegments).not.toContain("integrations");
  });
});
