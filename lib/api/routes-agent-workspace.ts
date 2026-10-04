import "server-only";
import type { ApiContext } from "./context";

export function routesAgentWorkspaceRoute(ctx: ApiContext) {
  const [first, projectId, resource, reportId] = ctx.path;
  if (first !== "projects" || !projectId) return null;
  if (resource === "context" && ctx.path.length === 3 && ["GET", "PATCH"].includes(ctx.method)) {
    return import("./agent-workspace").then((routes) => routes.projectContextRoute(ctx, projectId));
  }
  if (resource !== "agent-reports") return null;
  if (ctx.path.length === 3 && ["GET", "POST"].includes(ctx.method)) {
    return import("./agent-workspace").then((routes) => routes.agentReportsRoute(ctx, projectId));
  }
  if (ctx.path.length === 4 && reportId && ctx.method === "GET") {
    return import("./agent-workspace").then((routes) =>
      routes.agentReportRoute(ctx, projectId, reportId),
    );
  }
  return null;
}
