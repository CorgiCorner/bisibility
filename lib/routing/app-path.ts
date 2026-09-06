const APP_ROOT = "/app";

/**
 * A project's externally routable identifier (its `publicId`), never its database cuid.
 * Documentation only - the enforcement is `assertProjectRef` below, because a nominal
 * brand would have to be threaded through several dozen component props to be honest.
 */
export type ProjectRef = string;

/** Narrows untrusted route, query, and fixture strings at their boundary. */
export function asProjectRef(value: string): ProjectRef {
  return value;
}

const PROJECT_REF_PREFIX = "prj_";

/**
 * Every publicId is minted as `makePublicId("prj")`, so a ref without that prefix is an
 * internal cuid that leaked into URL construction. Such a URL renders fine and then 404s
 * at request time, which is exactly the kind of defect a unit test cannot see - so fail
 * loudly everywhere except production, where a hard throw would be worse than a bad link.
 */
/** The literal Next route-pattern segment, used to build revalidatePath targets. */
const PROJECT_REF_PATTERN = "[project]";

function assertProjectRef(projectRef: string, segments: string[]) {
  if (
    process.env.NODE_ENV === "production" ||
    projectRef.startsWith(PROJECT_REF_PREFIX) ||
    projectRef === PROJECT_REF_PATTERN
  ) {
    return;
  }
  throw new Error(
    `appPath expected a project publicId ("${PROJECT_REF_PREFIX}..."), received "${projectRef}" ` +
      `while building "/app/${[projectRef, ...segments].join("/")}". ` +
      "Pass the project's publicId, not its internal id.",
  );
}

/**
 * A market is a navigation level, not a page filter, so exactly one context segment may
 * follow the project. `m/` and `e/` are mutually exclusive; `~` is the deferred form that
 * resolves server-side to whichever context the reader was last in.
 */
export const MARKET_SEGMENT = "m";
export const ENGINE_SEGMENT = "e";
export const RESOLVED_CONTEXT_SEGMENT = "~";

/** A `ProjectMarket.publicId`, the only market identifier a URL carries. */
export type MarketRef = string;

/** Narrows untrusted route, query, and fixture strings at their boundary. */
export function asMarketRef(value: string): MarketRef {
  return value;
}

const MARKET_REF_PREFIX = "pmkt_";
/** The literal Next route-pattern segment, so revalidatePath targets stay buildable. */
const MARKET_REF_PATTERN = "[market]";

/** The market twin of `assertProjectRef`; a location id here 404s only at request time. */
function assertMarketRef(marketRef: string, segments: string[]) {
  if (
    process.env.NODE_ENV === "production" ||
    marketRef.startsWith(MARKET_REF_PREFIX) ||
    marketRef === MARKET_REF_PATTERN
  ) {
    return;
  }
  throw new Error(
    `marketPath expected a market publicId ("${MARKET_REF_PREFIX}..."), received "${marketRef}" ` +
      `while building "/app/.../${[MARKET_SEGMENT, marketRef, ...segments].join("/")}". ` +
      "Pass the ProjectMarket publicId, not a location id.",
  );
}

function joinedPath(root: string, segments: string[]) {
  const suffix = segments.map((segment) => segment.replace(/^\/+|\/+$/g, "")).filter(Boolean);
  return [root, ...suffix].join("/");
}

export function appPath(projectRef: ProjectRef, ...segments: string[]): string {
  assertProjectRef(projectRef, segments);
  return joinedPath(APP_ROOT, [projectRef, ...segments]);
}

/** `/app/{project}/m/{market}/{page}` - the market level of the same page. */
export function marketPath(
  projectRef: ProjectRef,
  marketRef: MarketRef,
  ...segments: string[]
): string {
  assertMarketRef(marketRef, segments);
  return appPath(projectRef, MARKET_SEGMENT, marketRef, ...segments);
}

/** `/app/{project}/~/{page}` - "the context I was in", resolved on the server. */
export function resolvedContextPath(projectRef: ProjectRef, ...segments: string[]): string {
  return appPath(projectRef, RESOLVED_CONTEXT_SEGMENT, ...segments);
}

export const SEARCH_CONSOLE_SEGMENT = "search-console" as const;

export function searchConsolePath(projectRef: ProjectRef): string {
  return appPath(projectRef, SEARCH_CONSOLE_SEGMENT);
}

export type RankTrackerTab = "runs" | "saved" | "tracked";

export function rankTrackerTabPath(projectRef: ProjectRef, tab: RankTrackerTab): string {
  const path = appPath(projectRef, "rank-tracker");
  return tab === "tracked" ? path : `${path}?tab=${tab}`;
}

export function appRootPath(...segments: string[]): string {
  return joinedPath(APP_ROOT, segments);
}

export type AppPathContext =
  | { kind: "engine"; ref: string }
  | { kind: "market"; ref: string }
  | { kind: "project" }
  | { kind: "resolved" };

const PROJECT_CONTEXT: AppPathContext = { kind: "project" };

function appPathSegments(pathname: string): string[] | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "app" || segments[1] === "account" || segments[1] === "admin") {
    return null;
  }
  return segments;
}

/** Which axis, if any, the URL scopes the page to. Never a cookie, always the URL. */
export function appPathContext(pathname: string): AppPathContext {
  const segments = appPathSegments(pathname);
  if (!segments) {
    return PROJECT_CONTEXT;
  }
  const head = segments[2];
  const ref = segments[3];
  if (head === RESOLVED_CONTEXT_SEGMENT) return { kind: "resolved" };
  if (head === MARKET_SEGMENT && ref) return { kind: "market", ref };
  if (head === ENGINE_SEGMENT && ref) return { kind: "engine", ref };
  return PROJECT_CONTEXT;
}

/** How many segments the context occupies, so the section index is derived, not guessed. */
function contextSegmentCount(context: AppPathContext): number {
  if (context.kind === "resolved") return 1;
  return context.kind === "project" ? 0 : 2;
}

export function appSectionPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "app") {
    return pathname;
  }
  if (segments[1] === "account" || segments[1] === "admin") {
    return joinedPath("", segments.slice(1));
  }
  return joinedPath("", segments.slice(2 + contextSegmentCount(appPathContext(pathname))));
}

/**
 * The same page's project-level pathname, with any context segment removed. The market level
 * is a different URL for the SAME nav destination, so anything that compares a pathname to a
 * project-level href - the rail's current-page marker above all - has to compare here or it
 * silently marks nothing while the reader is inside a market.
 */
export function contextFreePathname(pathname: string): string {
  const segments = appPathSegments(pathname);
  if (!segments) {
    return pathname;
  }
  const contextSegments = contextSegmentCount(appPathContext(pathname));
  if (contextSegments === 0) {
    return pathname;
  }
  return joinedPath(APP_ROOT, [segments[1] ?? "", ...segments.slice(2 + contextSegments)]);
}

export function projectScopedHref(projectRef: ProjectRef, href: string): string {
  const projectRoot = appPath(projectRef);
  if (href === projectRoot || href.startsWith(`${projectRoot}/`)) {
    return href;
  }
  if (href === APP_ROOT) {
    return projectRoot;
  }
  const relative = href.startsWith(`${APP_ROOT}/`) ? href.slice(APP_ROOT.length + 1) : href;
  return appPath(projectRef, relative);
}
