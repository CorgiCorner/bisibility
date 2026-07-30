import type { ApiContext } from "./context";

export function loopClosureRoutes(ctx: ApiContext) {
  const [first, projectId, resource, memberId, action] = ctx.path;
  if (first !== "projects" || !projectId) return null;

  if (
    resource === "exports" &&
    memberId === "rank-history" &&
    ctx.method === "GET" &&
    ctx.path.length === 4
  ) {
    return import("./rank-history-export").then((routes) =>
      routes.exportRankHistory(ctx, projectId),
    );
  }
  if (resource === "sitemap-monitors" && ctx.method === "GET" && ctx.path.length === 3) {
    return import("./sitemap-monitors").then((routes) =>
      routes.listSitemapMonitors(ctx, projectId),
    );
  }
  if (
    resource === "sitemap-monitors" &&
    memberId &&
    ctx.method === "PATCH" &&
    ctx.path.length === 4
  ) {
    return import("./sitemap-monitors").then((routes) =>
      routes.updateSitemapMonitor(ctx, projectId, memberId),
    );
  }
  if (
    resource === "triggered-alerts" &&
    memberId === "mark-read" &&
    ctx.method === "POST" &&
    ctx.path.length === 4
  ) {
    return import("./alerts").then((routes) =>
      routes.markProjectTriggeredAlertsRead(ctx, projectId),
    );
  }
  if (
    resource === "triggered-alerts" &&
    memberId &&
    action === "mute" &&
    ctx.method === "POST" &&
    ctx.path.length === 5
  ) {
    return import("./alerts").then((routes) =>
      routes.muteProjectTriggeredAlert(ctx, projectId, memberId),
    );
  }
  return null;
}
