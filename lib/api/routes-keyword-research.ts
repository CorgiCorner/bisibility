import "server-only";

import type { ApiContext } from "./context";

export function keywordResearchRoute(ctx: ApiContext) {
  const [first, projectId, resource] = ctx.path;
  if (first !== "projects" || !projectId || ctx.path.length !== 3) return null;
  if (resource === "keyword-research" && ctx.method === "GET") {
    return import("./keyword-research").then((routes) => routes.getKeywordResearch(ctx, projectId));
  }
  if (resource === "keyword-metrics" && ctx.method === "POST") {
    return import("./keyword-research").then((routes) => routes.postKeywordMetrics(ctx, projectId));
  }
  if (resource === "keyword-matches" && ctx.method === "POST") {
    return import("./keyword-matches").then((routes) =>
      routes.matchProjectKeywords(ctx, projectId),
    );
  }
  return null;
}
