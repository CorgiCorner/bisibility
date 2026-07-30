import "server-only";

import type { PersonalApiContext } from "./context";
import { requireAccountPathPublicIds } from "./public-id";

export function isPersonalTokenOnlyRoute(path: string[]) {
  return path[0] === "me";
}

export function isAccountRoute(path: string[]) {
  return isPersonalTokenOnlyRoute(path) || (path[0] === "projects" && path.length === 1);
}

export function dispatchAccountRoute(ctx: PersonalApiContext) {
  requireAccountPathPublicIds(ctx.path);
  const [first, second, third] = ctx.path;
  if (first === "projects" && ctx.path.length === 1) {
    if (ctx.method === "GET") {
      return import("./projects").then((routes) => routes.listProjectsForUser(ctx));
    }
    if (ctx.method === "POST") {
      return import("./projects").then((routes) => routes.createProjectForUser(ctx));
    }
    return null;
  }
  if (first !== "me") return null;
  if (ctx.path.length === 1) {
    if (ctx.method === "GET") {
      return import("./me").then((routes) => routes.getMe(ctx));
    }
    if (ctx.method === "PATCH") {
      return import("./me").then((routes) => routes.updateMe(ctx));
    }
    return null;
  }
  if (second === "tokens" && ctx.path.length === 2) {
    if (ctx.method === "GET") {
      return import("./tokens").then((routes) => routes.listTokens(ctx));
    }
    if (ctx.method === "POST") {
      return import("./tokens").then((routes) => routes.createToken(ctx));
    }
    return null;
  }
  if (second === "tokens" && third && ctx.path.length === 3 && ctx.method === "DELETE") {
    return import("./tokens").then((routes) => routes.revokeToken(ctx, third));
  }
  return null;
}
