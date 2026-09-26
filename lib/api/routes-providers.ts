import "server-only";

import type { ApiContext } from "./context";

export function providerMemberRoutes(ctx: ApiContext) {
  const [first, projectId, resource, id, action] = ctx.path;
  if (first !== "projects" || !projectId || resource !== "providers" || !id) return null;

  if (action === "connect" && ctx.method === "POST") {
    return import("./providers").then((routes) =>
      routes.connectProviderForProject(ctx, projectId, id),
    );
  }
  if (action === "test" && ctx.method === "POST") {
    return import("./providers").then((routes) =>
      routes.testProviderForProject(ctx, projectId, id),
    );
  }
  if (action === "budgets" && ctx.method === "PATCH" && ctx.path.length === 5) {
    return import("./provider-budgets").then((routes) =>
      routes.updateProviderBudgets(ctx, projectId, id),
    );
  }
  if (!action && ctx.method === "PATCH") {
    return import("./providers").then((routes) =>
      routes.updateProviderSettings(ctx, projectId, id),
    );
  }
  if (!action && ctx.method === "DELETE") {
    return import("./providers").then((routes) =>
      routes.disconnectProviderForProject(ctx, projectId, id),
    );
  }
  return null;
}
