import "server-only";

import type { ApiContext } from "./context";

export function domainOverviewRoute(ctx: ApiContext) {
  const [first, projectId, resource, action] = ctx.path;
  if (
    first !== "projects" ||
    !projectId ||
    resource !== "domain-overview" ||
    ctx.path.length !== 4 ||
    ctx.method !== "POST"
  ) {
    return null;
  }

  if (action === "analyze") {
    return import("./domain-overview").then((routes) =>
      routes.postDomainOverviewAnalyze(ctx, projectId),
    );
  }
  if (action === "history") {
    return import("./domain-overview").then((routes) =>
      routes.postDomainOverviewHistory(ctx, projectId),
    );
  }
  if (action === "keywords") {
    return import("./domain-overview").then((routes) =>
      routes.postDomainOverviewKeywords(ctx, projectId),
    );
  }
  if (action === "pages") {
    return import("./domain-overview").then((routes) =>
      routes.postDomainOverviewPages(ctx, projectId),
    );
  }
  return null;
}
