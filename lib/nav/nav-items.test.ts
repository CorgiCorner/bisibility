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
    const competitorsOnly = navItems("prj_example", undefined, ["competitors"]);

    expect(disabled.map((item) => item.label)).not.toContain("Timeline");
    expect(disabled.map((item) => item.label)).not.toContain("Competitors");
    expect(disabled.find((item) => item.label === "Model Playground")).toMatchObject({
      badge: "new",
      href: "/app/prj_example/model-playground",
      keywords: ["prompt playground", "compare models", "llm"],
    });
    expect(
      navItems("prj_example", undefined, allExperimentalModules).map((item) => item.label),
    ).not.toContain("Timeline");
    expect(competitorsOnly.find((item) => item.label === "Competitors")).toMatchObject({
      badge: "experimental",
      group: "seo",
      scope: "market",
    });
    expect(competitorsOnly.map((item) => item.label)).not.toContain("Timeline");
  });

  it("keeps the grouped rail in its settled flat order", () => {
    expect(
      navItems("prj_example", undefined, allExperimentalModules).map((item) => item.label),
    ).toEqual([
      "Dashboard",
      "Rank Tracker",
      "SERP Playground",
      "Keyword Research",
      "Domain Overview",
      "Backlinks",
      "Site Audit",
      "Competitors",
      "AI Visibility",
      "Model Playground",
      "Pages",
      "Search Console",
      "Annotations",
      "Reports",
      "Markets",
      "Alerts",
      "Runs",
      "Schedules",
      "Providers",
      "Usage",
      "Install",
      "Settings",
    ]);
  });

  it("groups existing destinations by purpose while keeping Dashboard standalone", () => {
    const items = navItems("prj_example", undefined, allExperimentalModules);
    expect(navItemGroups.map((group) => [group.id, group.label, group.tag])).toEqual([
      ["seo", "SEO", "SEO"],
      ["ai", "AI visibility", "AI"],
      ["reports", "Data & reports", "DATA"],
      ["project", "Project", "PROJECT"],
    ]);
    expect(items.filter((item) => item.group === null).map((item) => item.label)).toEqual([
      "Dashboard",
    ]);
    expect(items.filter((item) => item.group === "seo").map((item) => item.label)).toEqual([
      "Rank Tracker",
      "SERP Playground",
      "Keyword Research",
      "Domain Overview",
      "Backlinks",
      "Site Audit",
      "Competitors",
    ]);
    expect(items.filter((item) => item.group === "ai").map((item) => item.label)).toEqual([
      "AI Visibility",
      "Model Playground",
    ]);
    expect(items.filter((item) => item.group === "reports").map((item) => item.label)).toEqual([
      "Pages",
      "Search Console",
      "Annotations",
      "Reports",
    ]);
    expect(items.filter((item) => item.group === "project").map((item) => item.label)).toEqual([
      "Markets",
      "Alerts",
      "Runs",
      "Schedules",
      "Providers",
      "Usage",
      "Install",
      "Settings",
    ]);
    expect(items).toHaveLength(22);
    expect(
      items.some((item) => item.label === "Project Context" || item.label === "Analytics"),
    ).toBe(false);
    expect(items.find((item) => item.label === "Settings")).toMatchObject({
      activeHrefs: ["/app/prj_example/context"],
      href: "/app/prj_example/settings",
    });
  });

  it("keeps group help in tooltips and short captions on the collapsed rail", () => {
    for (const group of navItemGroups) {
      expect(group.tooltip.length).toBeGreaterThan(0);
      expect(group.tag).toMatch(/^[A-Z]+$/);
      expect(group.tag.length).toBeLessThanOrEqual(8);
    }
    expect(navItemGroups.map((group) => group.tooltip)).toEqual([
      "Track rankings and research keywords, websites, backlinks and site health.",
      "Track brand visibility in AI answers.",
      "Review connected search data and saved reports.",
      "Project configuration and shared operations.",
    ]);
  });

  it("keeps Install and Integrations in Project without making them landing preferences", () => {
    const items = navItems("prj_example", undefined, allExperimentalModules);
    const install = items.find((item) => item.label === "Install");
    const integrations = items.find((item) => item.label === "Providers");

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

  it("places Annotations in the rail and as a landing preference", () => {
    const annotations = navItems("prj_example").find((item) => item.label === "Annotations");
    expect(annotations).toMatchObject({
      badge: "new",
      group: "reports",
      href: "/app/prj_example/annotations",
      scope: "own-axis",
    });
    expect(annotations?.icon.displayName).toBe("NotePencilIcon");
    expect(primaryNavEntries.find((item) => item.segment === "annotations")?.label).toBe(
      "Annotations",
    );
  });

  it("uses the siren icon for Alerts", () => {
    expect(
      navItems("prj_example", undefined, allExperimentalModules).find(
        (item) => item.label === "Alerts",
      )?.icon.displayName,
    ).toBe("SirenIcon");
    expect(
      navItems("prj_example", undefined, allExperimentalModules).find(
        (item) => item.label === "Alerts",
      ),
    ).toMatchObject({
      group: "project",
      scope: "project",
    });
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

  it("keeps module maturity labels out of navigation while retaining experimental access", () => {
    const items = navItems("prj_example", undefined, allExperimentalModules);

    expect(items.filter((item) => item.badge).map((item) => [item.label, item.badge])).toEqual([
      ["Competitors", "experimental"],
      ["AI Visibility", "new"],
      ["Model Playground", "new"],
      ["Pages", "new"],
      ["Annotations", "new"],
    ]);
    expect(items.find((item) => item.label === "Search Console")?.badge).toBeUndefined();
    expect(items.find((item) => item.label === "Alerts")?.badge).toBeUndefined();
    expect(items.find((item) => item.label === "AI Visibility")).toMatchObject({
      href: "/app/prj_example/ai-visibility",
      keywords: [
        "geo",
        "aeo",
        "llm",
        "llmo",
        "chatgpt",
        "ai search",
        "prompt tracker",
        "prompt research",
        "brand visibility",
      ],
    });
    expect(items.find((item) => item.label === "AI Visibility")?.icon.displayName).toBe(
      "SparkleIcon",
    );
  });

  it("carries no count on any rail row", () => {
    const keys = new Set(
      navItems("prj_example", undefined, allExperimentalModules).flatMap((item) =>
        Object.keys(item),
      ),
    );

    expect([...keys].filter((key) => /count/iu.test(key))).toEqual([]);
    expect([...keys].sort()).toEqual([
      "activeHrefs",
      "badge",
      "group",
      "href",
      "icon",
      "keywords",
      "label",
      "scope",
    ]);
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
      "AI Visibility": "own-axis",
      "Model Playground": "own-axis",
      "Site Audit": "own-axis",
      Reports: "project",
      Alerts: "project",
      "Rank Tracker": "market",
      "SERP Playground": "own-axis",
      Competitors: "market",
      "Keyword Research": "own-axis",
      "Domain Overview": "own-axis",
      Backlinks: "own-axis",
      Pages: "own-axis",
      "Search Console": "own-axis",
      Annotations: "own-axis",
      Markets: "project",
      Runs: "project",
      Schedules: "project",
      Usage: "project",
      Providers: "project",
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
    expect(hrefs.Alerts).toBe("/app/prj_example/alerts?f=market:pmkt_example");
    expect(hrefs.Alerts).not.toContain("/m/pmkt_example/alerts");
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

  it("keeps landing preferences to the primary route segments", () => {
    expect(landingSegments).toEqual([
      "dashboard",
      "pages",
      "search-console",
      "keyword-research",
      "domain-overview",
      "rank-tracker",
      "backlinks",
      "competitors",
      "ai-visibility",
      "annotations",
    ]);
    expect(landingSegments).not.toContain("install");
    expect(landingSegments).not.toContain("integrations");
    expect(landingSegments).not.toContain("markets");
  });

  it("keeps landing preferences independent from rail entries", () => {
    expect(primaryNavEntries.map((entry) => entry.segment)).toEqual([...landingSegments]);
    expect(primaryNavEntries.find((entry) => entry.segment === "annotations")?.label).toBe(
      "Annotations",
    );
    expect(primaryNavEntries.find((entry) => entry.segment === "ai-visibility")).toMatchObject({
      label: "AI Visibility",
    });
    expect(navItems("prj_example").map((item) => item.label)).toContain("Annotations");
    for (const entry of primaryNavEntries) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.icon).toBeDefined();
    }
  });
});
