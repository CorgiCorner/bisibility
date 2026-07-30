import "server-only";

import type { ApiContext } from "./context";

export function topLevelMemberRoutes(ctx: ApiContext) {
  const [first, second, third] = ctx.path;
  if (first === "alert-rules" && second && ctx.path.length === 2) {
    if (ctx.method === "PATCH") {
      return import("./alerts").then((routes) => routes.updateAlertRuleById(ctx, second));
    }
    if (ctx.method === "DELETE") {
      return import("./alerts").then((routes) => routes.deleteAlertRuleById(ctx, second));
    }
  }
  if (first === "team" && second === "invites" && third && ctx.method === "DELETE") {
    return import("./team").then((routes) => routes.revokeTeamInvite(ctx, third));
  }
  if (first === "saved-views" && second && ctx.method === "DELETE") {
    return import("./saved-views").then((routes) => routes.deleteProjectSavedView(ctx, second));
  }
  if (first === "competitors" && second && ctx.method === "DELETE") {
    return import("./competitors").then((routes) => routes.removeProjectCompetitor(ctx, second));
  }
  if (first === "migration-tokens" && second && ctx.method === "DELETE") {
    return import("./migration-tokens").then((routes) =>
      routes.revokeProjectMigrationToken(ctx, second),
    );
  }
  return null;
}
