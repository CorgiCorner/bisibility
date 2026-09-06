import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { hasMarketRoute, MARKET_ROUTE_SECTIONS, sectionPathOf } from "./market-route-sections";
import { sectionScope } from "./page-scope";

const MARKET_ROUTE_DIR = resolve(process.cwd(), "app/app/(workspace)/[project]/m/[market]");

/**
 * The sections Next actually serves under `m/{market}`, read from the route files themselves so
 * the expectation below is derived rather than restated. A directory holding a `page` file is a
 * route; a route group adds no segment; the catch-all is not a route but the fallback for
 * everything that has none, which is exactly what this list must not include.
 */
function routedSections(dir: string = MARKET_ROUTE_DIR, section: string[] = []): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const found = entries.some((entry) => entry.isFile() && /^page\.tsx?$/u.test(entry.name))
    ? [sectionPathOf(section)]
    : [];

  for (const entry of entries.filter((candidate) => candidate.isDirectory())) {
    if (entry.name.startsWith("[...")) {
      continue;
    }
    const isRouteGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
    found.push(
      ...routedSections(
        resolve(dir, entry.name),
        isRouteGroup ? section : [...section, entry.name],
      ),
    );
  }

  return found.sort();
}

describe("market route sections", () => {
  /**
   * The invariant the whole module exists for. It fails in BOTH directions: a section listed
   * with no route sends `~` to a 404, and a route added without listing it leaves the market
   * level unreachable from `~` and unrecorded by the last-market cookie. Neither is visible in
   * a browser until someone happens to navigate the exact section that drifted.
   */
  it("lists exactly the sections the market route layer implements", () => {
    expect([...MARKET_ROUTE_SECTIONS].sort()).toEqual(routedSections());
  });

  it("lists only sections a market may scope at all", () => {
    for (const section of MARKET_ROUTE_SECTIONS) {
      expect([section, sectionScope(section)]).toEqual([section, "market"]);
    }
  });

  it("matches a section exactly, never by its head", () => {
    expect(hasMarketRoute("/rank-tracker")).toBe(true);
    // The keyword detail page has no market route of its own, so claiming one for it would
    // promote a URL straight into the catch-all.
    expect(hasMarketRoute("/rank-tracker/kw_1")).toBe(false);
    expect(hasMarketRoute("/competitors")).toBe(false);
    expect(hasMarketRoute("/settings")).toBe(false);
    expect(hasMarketRoute("")).toBe(false);
  });

  it("renders a section path the way a parsed pathname reads back", () => {
    expect(sectionPathOf([])).toBe("");
    expect(sectionPathOf(["rank-tracker"])).toBe("/rank-tracker");
    expect(sectionPathOf(["settings", "tracking"])).toBe("/settings/tracking");
    expect(sectionPathOf(["", "alerts"])).toBe("/alerts");
  });
});
