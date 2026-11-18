import "server-only";
import { AuthorizationError, authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { modelPlaygroundActorRuntime } from "@/lib/model-playground/server";
import type { ModelPlaygroundScope } from "./model-playground-service";

export function apiModelPlaygroundRuntime(scope: ModelPlaygroundScope) {
  // Project keys require a real owning user; ownerless projects deliberately fail closed.
  const projectKey = scope.credential.kind === "project_key";
  const runtime = modelPlaygroundActorRuntime(
    scope.projectPublicId,
    async () => {
      const user = await prisma.user.findUnique({
        where: { id: scope.actor.id },
        select: {
          id: true,
          deactivatedAt: true,
          memberships: { select: { projectId: true, role: true } },
        },
      });
      if (!user || user.deactivatedAt) throw new AuthorizationError("forbidden");
      return {
        id: user.id,
        memberships: projectKey
          ? [{ projectId: scope.projectId, role: "admin" as const }]
          : user.memberships,
      };
    },
    projectKey
      ? { projectId: scope.projectId, kind: "project_key", ownerId: scope.actor.id }
      : { projectId: scope.projectId, kind: "personal_token" },
  );
  const liveAuthorize = runtime.authorize;
  runtime.entrySource = scope.entrySource;
  runtime.authorize = async (action) => {
    // The API grant is a ceiling; a live membership cannot elevate the request's grant.
    authorize(scope.actor, action === "create" ? "update" : "read", {
      type: "project",
      projectId: scope.projectId,
    });
    return liveAuthorize(action);
  };
  return runtime;
}
