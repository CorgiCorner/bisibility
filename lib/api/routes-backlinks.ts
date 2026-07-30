import "server-only";

import type { ApiContext } from "./context";

export function backlinksRoute(ctx: ApiContext) {
  const [first, projectId, resource, member] = ctx.path;
  if (first !== "projects" || !projectId || resource !== "backlinks") return null;
  if (ctx.path.length === 3 && ctx.method === "GET") {
    return import("./backlinks").then((routes) => routes.getBacklinks(ctx, projectId));
  }
  if (ctx.path.length === 4 && member === "rows" && ctx.method === "POST") {
    return import("./backlinks").then((routes) => routes.postBacklinkRows(ctx, projectId));
  }
  return null;
}
