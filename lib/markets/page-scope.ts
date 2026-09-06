import { appSectionPath } from "@/lib/routing/app-path";

/**
 * Pages that describe the project itself, plus the project-wide feeds. A market is a
 * navigation level for pages that MEASURE a market; these do not, so they never carry the
 * segment and `~` always drops them to the project route.
 */
const PROJECT_SCOPED_SECTIONS = new Set([
  "alerts",
  "docs",
  "getting-started",
  "install",
  "integrations",
  "markets",
  "settings",
  "timeline",
]);

export type PageScope = "market" | "project";

/** The first section segment, which is what decides the class of the page. */
export function sectionHead(sectionPath: string): string {
  return sectionPath.split("/").filter(Boolean)[0] ?? "";
}

/**
 * A section path such as `/rank-tracker/kw_1`. The project root itself has no section and
 * is project-scoped, so an unknown section stays market-scopable by default: a new page is
 * far more often a measurement than a settings screen, and the market layout still 404s
 * anything that has no route.
 */
export function sectionScope(sectionPath: string): PageScope {
  const head = sectionHead(sectionPath);
  if (!head) {
    return "project";
  }
  return PROJECT_SCOPED_SECTIONS.has(head) ? "project" : "market";
}

/** The same decision from a full pathname, context segment included. */
export function pathnameScope(pathname: string): PageScope {
  return sectionScope(appSectionPath(pathname));
}
