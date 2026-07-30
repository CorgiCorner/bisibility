import type { ApiContext } from "./context";

type RouteResult = Response | Promise<Response>;

export function analyticsProjectRoute(
  ctx: ApiContext,
  projectId: string,
  resource: string | undefined,
  action: string | undefined,
): RouteResult | null {
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
