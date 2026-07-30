import type { ApiScope } from "./auth";
import { readShapedProjectPostScope } from "./read-shaped-post-routes";

export function requiredScope(method: string, path: string[]): ApiScope {
  const readShapedScope = readShapedProjectPostScope(method, path);
  if (readShapedScope) {
    return readShapedScope;
  }
  if (path[0] === "api-keys" || (path[0] === "projects" && path[2] === "api-keys")) {
    return "admin";
  }
  if (path[0] === "me" && path[1] === "tokens") {
    if (method === "DELETE" && path[2] === "current" && path.length === 3) return "read";
    return "admin";
  }
  if (method === "DELETE" && path[0] === "projects" && path.length === 2) return "admin";
  if (method === "DELETE" && path[0] === "projects" && path[2] === "webhooks") return "admin";
  if (path[0] === "projects" && path[2] === "team" && method !== "GET") return "admin";
  if (method === "GET" && path[0] === "projects" && path[2] === "ranked-keyword-suggestions") {
    return "write";
  }
  if (method === "GET" && path[0] === "projects" && path[2] === "keyword-research") {
    return "write";
  }
  if (method === "GET" && path[0] === "projects" && path[2] === "backlinks") {
    return "write";
  }
  return method === "GET" ? "read" : "write";
}

export function hasScope(scopes: readonly ApiScope[], required: ApiScope) {
  const rank = { admin: 3, read: 1, write: 2 } satisfies Record<ApiScope, number>;
  return scopes.some((scope) => rank[scope] >= rank[required]);
}
