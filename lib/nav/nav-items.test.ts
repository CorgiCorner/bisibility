import { experimentalModuleKeys } from "@/lib/settings/experimental-modules";
import { describe, expect, it } from "vitest";
import {
  landingSegments,
  navItemGroups,
  navItemHref,
  navItems,
  primaryNavEntries,
} from "./nav-items";

const allExperimentalModules = experimentalModuleKeys;

describe("navItems", () => {
  it("omits experimental modules until their keys are enabled", () => {
    const disabled = navItems("prj_example");
    const timelineOnly = navItems("prj_example", undefined, ["timeline"]);
    const competitorsOnly = navItems("prj_example", undefined, ["competitors"]);

    expect(disabled.map((item) => item.label)).not.toContain("Timeline");
    expect(disabled.map((item) => item.label)).not.toContain("Competitors");
    expect(timelineOnly.find((item) => item.label === "Timeline")).toMatchObject({
      badge: "experimental",
      group: "activity",
      scope: "level",
    });
    expect(timelineOnly.map((item) => item.label)).not.toContain("Competitors");
    expect(competitorsOnly.find((item) => item.label === "Competitors")).toMatchObject({
      badge: "experimental",
      group: "modules",
      scope: "market",
    });
    expect(competitorsOnly.map((item) => item.label)).not.toContain("Timeline");
  });

  it("keeps the grouped rail in its settled flat order", () => {
    expect(
      navItems("prj_example", undefined, allExperimentalModules).map((item) => item.label),
    ).toEqual([
      "Dashboard",
      "Timeline",
      "Alerts",
      "Rank Tracker",
      "Competitors",
      "Keyword Research",
      "Domain Overview",
      "Backlinks",
      "Search Console",
      "Markets",
      "Integrations",
      "Install",
      "Settings",
    ]);
  });

  it("assigns every rail row to one of the three groups", () => {
    const items = navItems("prj_example", undefined, allExperimentalModules);

    expect(navItemGroups.map((group) => [group.id, group.label, group.tag])).toEqual([
      ["activity", "Activity", "ACTIVITY"],
      ["modules", "Modules", "MODULES"],
      ["project", "Project", "PROJECT"],
    ]);
    expect(items.filter((item) => item.group === "activity").map((item) => item.label)).toEqual([
      "Dashboard",
      "Timeline",
      "Alerts",
    ]);
    // Market modules first, own-axis modules after: the order is the group's only sub-structure.
    expect(items.filter((item) => item.group === "modules").map((item) => item.label)).toEqual([
      "Rank Tracker",
      "Competitors",
      "Keyword Research",
      "Domain Overview",
      "Backlinks",
      "Search Console",
    ]);
    expect(items.filter((item) => item.group === "project").map((item) => item.label)).toEqual([
      "Markets",
      "Integrations",
      "Install",
      "Settings",
    ]);
    // Every destination is in exactly one group, so no renderer needs an ungrouped block.
    expect(items).toHaveLength(13);
    expect(new Set(items.map((item) => item.group))).toEqual(
      new Set(navItemGroups.map((group) => group.id)),
    );
  });

  it("says what scopes a group covers in its tooltip rather than under its heading", () => {
    for (const group of navItemGroups) {
      expect(group.tooltip.length).toBeGreaterThan(0);
      expect(group.tag).toBe(group.label.toUpperCase());
    }
    expect(navItemGroups.map((group) => group.tooltip)).toEqual([
      "Follows the level you are on: the project, or the market you switched into.",
      "Market modules follow the selected market. The rest keep their own axis.",
      "Project-wide configuration. A market never narrows it.",
    ]);
  });

  it("keeps Install and Integrations in Project without making them landing preferences", () => {
    const items = navItems("prj_example", undefined, allExperimentalModules);
    const install = items.find((item) => item.label === "Install");
    const integrations = items.find((item) => item.label === "Integrations");

    expect(install).toMatchObject({
      group: "project",
      href: "/app/prj_example/install",
      scope: "project",
    });
    expect(install?.icon.displayName).toBe("SparkleIcon");
    expect(integrations?.group).toBe("project");
    expect(integrations?.scope).toBe("project");
  });

  it("keeps the hrefs whose segment does not follow from the label", () => {
    const items = navItems("prj_example", undefined, allExperimentalModules);

    const searchConsole = items.find((item) => item.label === "Search Console");
    expect(searchConsole?.href).toBe("/app/prj_example/search-console");
    expect(items.find((item) => item.label === "Rank Tracker")?.href).toBe(
      "/app/prj_example/rank-tracker",
    );
    expect(items.find((item) => item.label === "Rank Tracker")?.icon.displayName).toBe(
      "RankingIcon",
    );
  });

  it("uses the history clock icon for Timeline", () => {
    expect(
      navItems("prj_example", undefined, allExperimentalModules).find(
        (item) => item.label === "Timeline",
      )?.icon.displayName,
    ).toBe("ClockCounterClockwiseIcon");
  });

  it("uses the siren icon for Alerts", () => {
    expect(
      navItems("prj_example", undefined, allExperimentalModules).find(
        (item) => item.label === "Alerts",
      )?.icon.displayName,
    ).toBe("SirenIcon");
  });

  it("gives Markets the folded map and leaves the globe to Domain Overview", () => {
    const items = navItems("prj_example", undefined, allExperimentalModules);
    const markets = items.find((item) => item.label === "Markets");

    expect(markets).toMatchObject({ group: "project", href: "/app/prj_example/markets" });
    expect(markets?.icon.displayName).toBe("MapTrifoldIcon");
    expect(items.find((item) => item.label === "Domain Overview")?.icon.displayName).toBe(
      "GlobeIcon",
    );
  });

  it("gives Search Console the rising chart rather than the vendor logo", () => {
    expect(
      navItems("prj_example", undefined, allExperimentalModules).find(
        (item) => item.label === "Search Console",
      )?.icon.displayName,
    ).toBe("ChartLineUpIcon");
  });

  it("assigns module tags only to the designated entries", () => {
    expect(
      Object.fromEntries(
        navItems("prj_example", undefined, allExperimentalModules).map((item) => [
          item.label,
          item.badge,
        ]),
      ),
    ).toEqual({
      Dashboard: undefined,
      Timeline: "experimental",
      Alerts: "alpha",
      "Rank Tracker": undefined,
      Competitors: "experimental",
      "Keyword Research": undefined,
      "Domain Overview": undefined,
      Backlinks: undefined,
      "Search Console": "alpha",
      Markets: undefined,
      Integrations: undefined,
      Install: undefined,
      Settings: undefined,
    });
  });

  it("carries no count on any rail row", () => {
    const keys = new Set(
      navItems("prj_example", undefined, allExperimentalModules).flatMap((item) =>
        Object.keys(item),
      ),
    );

    expect([...keys].filter((key) => /count/iu.test(key))).toEqual([]);
    expect([...keys].sort()).toEqual(["badge", "group", "href", "icon", "label", "scope"]);
  });

  it("gives every rail row a scope", () => {
    expect(
      Object.fromEntries(
        navItems("prj_example", undefined, allExperimentalModules).map((item) => [
          item.label,
          item.scope,
        ]),
      ),
    ).toEqual({
      Dashboard: "level",
      Timeline: "level",
      Alerts: "level",
      "Rank Tracker": "market",
      Competitors: "market",
      "Keyword Research": "own-axis",
      "Domain Overview": "own-axis",
      Backlinks: "own-axis",
      "Search Console": "own-axis",
      Markets: "project",
      Integrations: "project",
      Install: "project",
      Settings: "project",
    });
  });

  it("resolves every href at the project route when no context exists", () => {
    for (const item of navItems("prj_example", undefined, allExperimentalModules)) {
      expect(item.href.startsWith("/app/prj_example/")).toBe(true);
      expect(item.href.split("/")).toHaveLength(4);
    }
    // An empty context is the same as none: nothing has been switched into yet.
    expect(navItems("prj_example", {}, allExperimentalModules).map((item) => item.href)).toEqual(
      navItems("prj_example", undefined, allExperimentalModules).map((item) => item.href),
    );
  });

  it("points only routed market rows into the market a context supplies", () => {
    const context = { marketSegments: ["m", "pmkt_example"] } as const;
    const hrefs = Object.fromEntries(
      navItems("prj_example", context, allExperimentalModules).map((item) => [
        item.label,
        item.href,
      ]),
    );

    expect(hrefs.Dashboard).toBe("/app/prj_example/dashboard");
    expect(hrefs.Timeline).toBe("/app/prj_example/timeline");
    expect(hrefs.Alerts).toBe("/app/prj_example/alerts");
    expect(hrefs["Rank Tracker"]).toBe("/app/prj_example/m/pmkt_example/rank-tracker");
    expect(hrefs.Competitors).toBe("/app/prj_example/competitors");
    expect(hrefs.Backlinks).toBe("/app/prj_example/backlinks");
    expect(hrefs.Markets).toBe("/app/prj_example/markets");
  });

  it("resolves one href from a scope and a segment", () => {
    expect(navItemHref({ scope: "market", segment: "competitors" }, "prj_example")).toBe(
      "/app/prj_example/competitors",
    );
    expect(
      navItemHref({ scope: "market", segment: "competitors" }, "prj_example", {
        marketSegments: ["m", "pmkt_example"],
      }),
    ).toBe("/app/prj_example/competitors");
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
    expect(landingSegments).not.toContain("markets");
  });

  it("still resolves a rail entry for every landing segment", () => {
    // primaryNavEntries throws at module load when a landing segment has no rail row, and the
    // module is imported by server actions, so this is an import-time crash rather than a
    // render-time one. Reading it here is what proves the module still loads.
    expect(primaryNavEntries.map((entry) => entry.segment)).toEqual([...landingSegments]);
    for (const entry of primaryNavEntries) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.icon).toBeDefined();
    }
  });
});
