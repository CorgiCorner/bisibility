import "server-only";

import {
  createApiKey,
  createProjectApiKey,
  listApiKeys,
  listProjectApiKeys,
  revokeApiKey,
} from "./api-keys";
import type { ApiContext } from "./context";
import { bulkKeywords } from "./keyword-bulk";
import { createKeywords } from "./keyword-create";
import { deleteKeyword, getKeyword, listKeywords, patchKeyword } from "./keywords";
import { getProjectDefaults, updateProjectDefaults } from "./project-defaults";
import { getProjectOverview } from "./project-overview";
import { createProject, deleteProject, getProject, listProjects, updateProject } from "./projects";
import { requireApiPathPublicIds } from "./public-id";
import { getRankCheck, listRankChecks, runRankCheck } from "./rank-checks";
import { analyticsProjectRoute } from "./routes-analytics";
import { backlinksRoute } from "./routes-backlinks";
import { domainOverviewRoute } from "./routes-domain-overview";
import { keywordResearchRoute } from "./routes-keyword-research";
import { loopClosureRoutes } from "./routes-loop-closure";
import { topLevelMemberRoutes } from "./routes-members";

function projectRoutes(ctx: ApiContext) {
  const [first, second, third] = ctx.path;
  if (first !== "projects") return null;
  if (ctx.path.length === 1) {
    const handlers = { GET: () => listProjects(ctx), POST: () => createProject(ctx) };
    return handlers[ctx.method as keyof typeof handlers]?.() ?? null;
  }
  if (!second) return null;
  if (ctx.path.length === 2) {
    const handlers = {
      DELETE: () => deleteProject(ctx, second),
      GET: () => getProject(ctx, second),
      PATCH: () => updateProject(ctx, second),
    };
    return handlers[ctx.method as keyof typeof handlers]?.() ?? null;
  }
  if (third === "keywords" && ctx.path.length === 3) {
    const handlers = {
      GET: () => listKeywords(ctx, second),
      POST: () => createKeywords(ctx, second),
    };
    return handlers[ctx.method as keyof typeof handlers]?.() ?? null;
  }
  return null;
}

function rankAndSignalRoutes(ctx: ApiContext) {
  const [first, second, third] = ctx.path;
  if (first === "signals" && ctx.path.length === 1 && ctx.method === "POST") {
    return import("./signals").then((routes) => routes.createSignalForProject(ctx));
  }
  if (first === "rank-checks" && second && ctx.method === "GET" && ctx.path.length === 2) {
    return getRankCheck(ctx, second);
  }
  if (first === "keywords" && second && ctx.path.length === 3 && third === "rank-checks") {
    return ctx.method === "GET" ? listRankChecks(ctx, second) : null;
  }
  if (first === "keywords" && second && ctx.path.length === 3 && third === "checks") {
    return ctx.method === "POST" ? runRankCheck(ctx, second) : null;
  }
  return null;
}

function keywordRoutes(ctx: ApiContext) {
  const [first, second] = ctx.path;
  if (first !== "keywords" || !second) return null;
  if (ctx.path.length === 2 && second === "bulk")
    return ctx.method === "POST" ? bulkKeywords(ctx) : null;
  if (ctx.path.length === 2) {
    const handlers = {
      DELETE: () => deleteKeyword(ctx, second),
      GET: () => getKeyword(ctx, second),
      PATCH: () => patchKeyword(ctx, second),
    };
    return handlers[ctx.method as keyof typeof handlers]?.() ?? null;
  }
  return null;
}

function apiKeyRoutes(ctx: ApiContext) {
  const [first, second] = ctx.path;
  if (first === "api-keys" && ctx.path.length === 1) {
    if (ctx.method === "GET") return listApiKeys(ctx);
    if (ctx.method === "POST") return createApiKey(ctx);
  }
  if (ctx.method === "DELETE" && first === "api-keys" && second && ctx.path.length === 2) {
    return revokeApiKey(ctx, second);
  }
  return null;
}

const existingRoutes = (ctx: ApiContext) =>
  projectRoutes(ctx) ?? apiKeyRoutes(ctx) ?? keywordRoutes(ctx) ?? rankAndSignalRoutes(ctx);

type RouteResult = Response | Promise<Response>;

function standardProjectCollectionRoute(
  ctx: ApiContext,
  projectId: string,
  resource: string,
): RouteResult | null {
  if (ctx.path.length !== 3) return null;
  const handlers: Record<string, Partial<Record<ApiContext["method"], () => RouteResult>>> = {
    "alert-rules": {
      GET: () => import("./alerts").then((routes) => routes.listAlertRules(ctx, projectId)),
      POST: () =>
        import("./alerts").then((routes) => routes.createAlertRuleForProject(ctx, projectId)),
    },
    "api-keys": {
      GET: () => listProjectApiKeys(ctx, projectId),
      POST: () => createProjectApiKey(ctx, projectId),
    },
    competitors: {
      GET: () =>
        import("./competitors").then((routes) => routes.listProjectCompetitors(ctx, projectId)),
      POST: () =>
        import("./competitors").then((routes) => routes.addProjectCompetitor(ctx, projectId)),
    },
    defaults: {
      GET: () => getProjectDefaults(ctx, projectId),
      PATCH: () => updateProjectDefaults(ctx, projectId),
    },
    "migration-tokens": {
      GET: () =>
        import("./migration-tokens").then((routes) => routes.listMigrationTokens(ctx, projectId)),
      POST: () =>
        import("./migration-tokens").then((routes) =>
          routes.mintProjectMigrationToken(ctx, projectId),
        ),
    },
    "notification-preferences": {
      GET: () =>
        import("./notification-prefs").then((routes) =>
          routes.getProjectNotificationPreferences(ctx, projectId),
        ),
      PATCH: () =>
        import("./notification-prefs").then((routes) =>
          routes.updateProjectNotificationPreferences(ctx, projectId),
        ),
    },
    overview: { GET: () => getProjectOverview(ctx, projectId) },
    providers: {
      GET: () => import("./providers").then((routes) => routes.listProviders(ctx, projectId)),
    },
    "ranked-keyword-suggestions": {
      GET: () =>
        import("./ranked-keywords").then((routes) =>
          routes.listRankedKeywordSuggestions(ctx, projectId),
        ),
    },
    "saved-keywords": {
      GET: () =>
        import("./saved-keywords").then((routes) =>
          routes.listProjectSavedKeywords(ctx, projectId),
        ),
      POST: () =>
        import("./saved-keywords").then((routes) =>
          routes.createProjectSavedKeywords(ctx, projectId),
        ),
    },
    "saved-views": {
      GET: () =>
        import("./saved-views").then((routes) => routes.listProjectSavedViews(ctx, projectId)),
      POST: () =>
        import("./saved-views").then((routes) => routes.createProjectSavedView(ctx, projectId)),
    },
    signals: {
      GET: () => import("./signals").then((routes) => routes.listProjectSignals(ctx, projectId)),
    },
    "triggered-alerts": {
      GET: () => import("./alerts").then((routes) => routes.listTriggeredAlerts(ctx, projectId)),
    },
    webhooks: {
      GET: () => import("./webhooks").then((routes) => routes.listWebhooks(ctx, projectId)),
      POST: () => import("./webhooks").then((routes) => routes.createWebhook(ctx, projectId)),
    },
  };
  return handlers[resource]?.[ctx.method]?.() ?? null;
}

function projectCollectionRoutes(ctx: ApiContext) {
  const [first, projectId, resource, fourth, fifth] = ctx.path;
  if (first !== "projects" || !projectId) return null;

  const specializedRoute =
    (resource ? standardProjectCollectionRoute(ctx, projectId, resource) : null) ??
    keywordResearchRoute(ctx) ??
    backlinksRoute(ctx) ??
    domainOverviewRoute(ctx) ??
    analyticsProjectRoute(ctx, projectId, resource, fourth);
  if (specializedRoute) return specializedRoute;

  if (resource === "team" && fourth === "members" && ctx.path.length === 4) {
    if (ctx.method === "GET")
      return import("./team").then((routes) => routes.listTeamMembers(ctx, projectId));
  }
  if (resource === "team" && fourth === "invites" && ctx.path.length === 4) {
    if (ctx.method === "GET") {
      return import("./team").then((routes) => routes.listTeamInvites(ctx, projectId));
    }
    if (ctx.method === "POST") {
      return import("./team").then((routes) => routes.createTeamInvite(ctx, projectId));
    }
  }
  if (
    resource === "team" &&
    fourth === "invites" &&
    fifth &&
    ctx.method === "DELETE" &&
    ctx.path.length === 5
  ) {
    return import("./team").then((routes) => routes.revokeTeamInvite(ctx, fifth, projectId));
  }
  if (resource === "team" && fourth === "members" && fifth && ctx.path.length === 5) {
    if (ctx.method === "PATCH")
      return import("./team").then((routes) => routes.updateTeamMemberRole(ctx, fifth, projectId));
    if (ctx.method === "DELETE")
      return import("./team").then((routes) => routes.deleteTeamMember(ctx, fifth, projectId));
  }
  if (
    resource === "team" &&
    fourth === "invites" &&
    fifth &&
    ctx.path[5] === "resend" &&
    ctx.method === "POST" &&
    ctx.path.length === 6
  ) {
    return import("./team").then((routes) => routes.resendTeamInvite(ctx, fifth, projectId));
  }
  return null;
}

function providerMemberRoutes(ctx: ApiContext) {
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

function projectMemberRoutes(ctx: ApiContext) {
  const [first, projectId, resource, id] = ctx.path;
  if (first !== "projects" || !projectId || !resource || !id) return null;

  const providerRoute = providerMemberRoutes(ctx);
  if (providerRoute) return providerRoute;
  if (resource === "webhooks" && ctx.method === "PATCH") {
    return import("./webhooks").then((routes) => routes.updateWebhook(ctx, projectId, id));
  }
  if (resource === "webhooks" && ctx.method === "DELETE") {
    return import("./webhooks").then((routes) => routes.deleteWebhook(ctx, projectId, id));
  }
  if (resource === "saved-keywords" && ctx.method === "DELETE") {
    return import("./saved-keywords").then((routes) =>
      routes.deleteProjectSavedKeyword(ctx, id, projectId),
    );
  }
  if (resource === "saved-views" && ctx.method === "DELETE") {
    return import("./saved-views").then((routes) =>
      routes.deleteProjectSavedView(ctx, id, projectId),
    );
  }
  if (resource === "competitors" && ctx.method === "DELETE") {
    return import("./competitors").then((routes) =>
      routes.removeProjectCompetitor(ctx, id, projectId),
    );
  }
  if (resource === "migration-tokens" && ctx.method === "DELETE") {
    return import("./migration-tokens").then((routes) =>
      routes.revokeProjectMigrationToken(ctx, id, projectId),
    );
  }
  return null;
}

export function dispatchRoute(ctx: ApiContext) {
  requireApiPathPublicIds(ctx.path);
  return (
    existingRoutes(ctx) ??
    loopClosureRoutes(ctx) ??
    projectCollectionRoutes(ctx) ??
    projectMemberRoutes(ctx) ??
    topLevelMemberRoutes(ctx)
  );
}
