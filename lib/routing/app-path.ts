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

function joinedPath(root: string, segments: string[]) {
  const suffix = segments.map((segment) => segment.replace(/^\/+|\/+$/g, "")).filter(Boolean);
  return [root, ...suffix].join("/");
}

export function appPath(projectRef: ProjectRef, ...segments: string[]): string {
  assertProjectRef(projectRef, segments);
  return joinedPath(APP_ROOT, [projectRef, ...segments]);
}

export type RankTrackerTab = "checks" | "saved" | "tracked";

export function rankTrackerTabPath(projectRef: ProjectRef, tab: RankTrackerTab): string {
  const path = appPath(projectRef, "rank-tracker");
  return tab === "tracked" ? path : `${path}?tab=${tab}`;
}

export function appRootPath(...segments: string[]): string {
  return joinedPath(APP_ROOT, segments);
}

export function appSectionPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "app") {
    return pathname;
  }
  const sectionIndex = segments[1] === "account" || segments[1] === "admin" ? 1 : 2;
  return joinedPath("", segments.slice(sectionIndex));
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
