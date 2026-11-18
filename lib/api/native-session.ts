import "server-only";
import { withPracticeRequest } from "@/lib/achievements/api";
import { canProjectAction } from "@/lib/auth/capabilities";
import { prisma } from "@/lib/db/prisma";
import { isProjectReadOnly, ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { isAccountRoute, isPersonalTokenOnlyRoute } from "./account-routes";
import { apiAdmissionErrorDetails } from "./admission-error-details";
import { unsupportedApiVersionResponse } from "./api-versions";
import type { ApiContext } from "./context";
import { errorFromUnknown } from "./error-mapper";
import { scopeToEnforce } from "./estimate-only-scope";
import { withIdempotency } from "./idempotency";
import { operationPolicyForRequest } from "./operation-policy";
import { PROJECT_HEADER, scopesForRole } from "./personal-scope";
import { requiresRecentAppAuthentication } from "./recent-auth";
import { hasScope } from "./request-scope";
import { type ApiErrorCode, errorResponse, methodNotAllowed, routeNotFound } from "./responses";
import { dispatchRoute } from "./routes";

export type NativeSessionPrincipal = { kind: "native_session"; userId: string; sessionId: string };
const methods = ["DELETE", "GET", "PATCH", "POST", "PUT"] as const;

/** Trusted callers must obtain the principal from a verified server-side session. */
export async function handleNativeSessionApiRequest(
  req: Request,
  path: string[],
  principal: NativeSessionPrincipal,
) {
  const url = new URL(req.url),
    headers = new Headers();
  const instance = `urn:bisibility:api:v1:${url.pathname}`;
  const error = (code: ApiErrorCode, message: string, status: number) =>
    errorResponse(code, message, status, { headers, instance });
  const versionError = unsupportedApiVersionResponse(req);
  if (versionError) return versionError;
  const method = req.method.toUpperCase();
  if (!methods.some((candidate) => candidate === method))
    return methodNotAllowed(methods, { instance });
  if (
    !principal.userId ||
    !principal.sessionId ||
    isAccountRoute(path) ||
    isPersonalTokenOnlyRoute(path) ||
    requiresRecentAppAuthentication(method, path)
  )
    return error("forbidden", "This operation is unavailable to a native session.", 403);
  const publicId = req.headers.get(PROJECT_HEADER);
  if (
    !publicId ||
    !/^prj_[A-Za-z0-9]{1,40}$/.test(publicId) ||
    (path[0] === "projects" && path[1] && path[1] !== publicId)
  )
    return error("not_found", "Project not found.", 404);
  const policy = operationPolicyForRequest(method, path);
  if (!policy) return routeNotFound({ headers, instance });
  const project = await prisma.project.findUnique({
    where: { publicId },
    select: {
      id: true,
      publicId: true,
      name: true,
      domain: true,
      ownerId: true,
      writeMode: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!project) return error("not_found", "Project not found.", 404);
  const [membership, user] = await Promise.all([
    prisma.membership.findUnique({
      where: { userId_projectId: { userId: principal.userId, projectId: project.id } },
      select: { role: true },
    }),
    prisma.user.findUnique({ where: { id: principal.userId }, select: { deactivatedAt: true } }),
  ]);
  if (!membership || !user || user.deactivatedAt)
    return error("not_found", "Project not found.", 404);
  const scopes = scopesForRole(membership.role);
  const requiredScope = await scopeToEnforce(policy, req, url);
  if (
    !hasScope(scopes, requiredScope) ||
    (policy.capability &&
      !canProjectAction(membership.role, policy.capability.action, policy.capability.resourceType))
  )
    return error("forbidden", "Your project role does not allow this operation.", 403);
  if (policy.projectAccess === "write" && isProjectReadOnly(project.writeMode))
    return error("project_read_only", new ProjectReadOnlyError().message, 423);
  const actor = {
    id: principal.userId,
    memberships: [{ projectId: project.id, role: membership.role }],
  };
  const ctx: ApiContext = {
    actor,
    actorId: principal.userId,
    auth: { kind: "native_session", project, scopes },
    headers,
    instance,
    method,
    origin: { surface: "app", source: "app", credentialId: null, credentialKind: null },
    path,
    req,
    url,
  };
  const execute = async () => {
    try {
      const response = await withPracticeRequest(ctx, policy.operationId, () =>
        dispatchRoute(ctx, policy.operationId),
      );
      return response ?? routeNotFound({ headers, instance });
    } catch (cause) {
      const details = await apiAdmissionErrorDetails(cause, ctx);
      return errorFromUnknown(cause, headers, url, details);
    }
  };
  return method === "GET"
    ? execute()
    : withIdempotency(
        { apiKeyId: `assistant:${principal.userId}`, headers, method, pathname: url.pathname, req },
        execute,
      );
}
