import "server-only";

import type { ApiContext } from "./context";

export function researchReportsRoute(ctx: ApiContext) {
  const [first, projectId, resource, collection, kind] = ctx.path;
  if (first !== "projects" || !projectId || resource !== "research") return null;
  if (ctx.path.length === 4 && collection === "reports" && ctx.method === "GET") {
    return import("./research-reports").then((routes) =>
      routes.listStoredResearchReports(ctx, projectId),
    );
  }
  if (ctx.path.length === 5 && collection === "reports" && kind && ctx.method === "GET") {
    return import("./research-reports").then((routes) =>
      routes.getStoredResearchReport(ctx, projectId, kind),
    );
  }
  return null;
}
