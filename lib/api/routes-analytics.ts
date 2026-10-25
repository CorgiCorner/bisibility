import type { ApiContext } from "./context";

type RouteResult = Response | Promise<Response>;

export function analyticsProjectRoute(
  ctx: ApiContext,
  projectId: string,
  resource: string | undefined,
  action: string | undefined,
): RouteResult | null {
  if (resource === "search-index") {
    if (
      ctx.path.length === 4 &&
      action &&
      ((["report", "urls", "settings"].includes(action) && ctx.method === "GET") ||
        (action === "settings" && ctx.method === "PATCH"))
    )
      return import("./page-indexing").then((routes) =>
        routes.pageIndexingApi(ctx, projectId, action),
      );
    if (action === "sitemaps" && ctx.method === "GET" && [4, 5].includes(ctx.path.length))
      return import("./search-index").then((routes) =>
        routes.searchIndexApi(ctx, projectId, ctx.path[4]),
      );
    if (action === "inspections" && ctx.method === "POST" && ctx.path.length === 4)
      return import("./search-index").then((routes) => routes.searchIndexApi(ctx, projectId));
    return null;
  }
  if (resource !== "analytics" || !action || ctx.path.length !== 4) return null;
  if (action === "traffic-snapshots" && ctx.method === "GET")
    return import("./analytics").then((routes) => routes.listTrafficSnapshots(ctx, projectId));
  if (action === "query-stats" && ctx.method === "GET")
    return import("./analytics").then((routes) =>
      routes.listSearchPerformanceQueryStats(ctx, projectId),
    );
  if (action === "sync" && ctx.method === "POST")
    return import("./analytics").then((routes) => routes.syncProjectTrafficApi(ctx, projectId));
  return null;
}
