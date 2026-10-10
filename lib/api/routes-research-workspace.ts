import type { ApiContext } from "./context";

export function researchWorkspaceRoute(ctx: ApiContext) {
  const [first, projectId, resource] = ctx.path;
  if (first !== "projects" || !projectId) return null;
  if (resource === "ai-tracking") {
    return import("./ai-tracking").then((routes) => routes.aiTrackingRoute(ctx));
  }
  if (["context", "agent-reports"].includes(resource ?? "")) {
    return import("./routes-agent-workspace").then((routes) =>
      routes.routesAgentWorkspaceRoute(ctx),
    );
  }
  if (resource === "site-audits") {
    return import("./site-audits").then((routes) => routes.siteAuditsRoute(ctx));
  }
  if (resource === "ai-catalog" && ctx.method === "GET" && ctx.path.length === 3)
    return import("./ai-research").then((routes) => routes.getAiCatalog(ctx, projectId));
  if (ctx.method === "POST" && ctx.path.length === 3) {
    if (resource === "ai-visibility")
      return import("./ai-research").then((routes) => routes.postAiVisibility(ctx, projectId));
    if (resource === "prompt-explorer")
      return import("./ai-research").then((routes) => routes.postPromptExplorer(ctx, projectId));
  }
  return null;
}
