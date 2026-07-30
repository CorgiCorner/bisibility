import type { ApiScope } from "./auth";

const READ_SHAPED_PROJECT_POST_ROUTES = {
  "keyword-matches": "read",
  "keyword-metrics": "write",
} as const satisfies Record<string, ApiScope>;

export function readShapedProjectPostScope(method: string, path: string[]) {
  const resource = path[2];
  if (
    method !== "POST" ||
    path[0] !== "projects" ||
    !resource ||
    !Object.hasOwn(READ_SHAPED_PROJECT_POST_ROUTES, resource)
  ) {
    return undefined;
  }

  return READ_SHAPED_PROJECT_POST_ROUTES[resource as keyof typeof READ_SHAPED_PROJECT_POST_ROUTES];
}

export function isReadShapedProjectPostRoute(method: string, path: string[]) {
  return readShapedProjectPostScope(method, path) !== undefined;
}
