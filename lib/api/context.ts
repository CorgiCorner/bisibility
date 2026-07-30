import type { Actor } from "@/lib/auth/authorize";
import type { AuthenticatedApiKey, PersonalTokenAuth } from "./auth";
import { errorResponse } from "./responses";

export type ApiContext = {
  actor?: Actor;
  // User id when the request is authenticated by a personal token; null for
  // project keys (which carry no user identity). Used for audit attribution.
  actorId?: string | null;
  auth: AuthenticatedApiKey;
  headers: Headers;
  instance: string;
  method: string;
  path: string[];
  req: Request;
  url: URL;
};

// Context for account-level routes (/me*, project collection) that only a
// personal token can reach; there is no single project in scope.
export type PersonalApiContext = {
  auth: PersonalTokenAuth;
  headers: Headers;
  instance: string;
  method: string;
  path: string[];
  req: Request;
  url: URL;
};

export function projectMatches(auth: AuthenticatedApiKey, projectId: string) {
  return projectId === auth.project.publicId;
}

export function forbidden(ctx: Pick<ApiContext, "headers" | "instance">, detail: string) {
  return errorResponse("forbidden", detail, 403, {
    headers: ctx.headers,
    instance: ctx.instance,
  });
}

export function notFound(ctx: Pick<ApiContext, "headers" | "instance">, detail: string) {
  return errorResponse("not_found", detail, 404, {
    headers: ctx.headers,
    instance: ctx.instance,
  });
}
