import "server-only";
import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import type { Actor } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { meteringNamespace } from "@/lib/metering/runtime";
import { ModelAdmissionRefusal } from "./payment";
import type { ModelPlaygroundRuntime } from "./runtime-contract";
import { createModelPlaygroundRuntime } from "./runtime-factory";

/** Server-owned rollout switch. The native own-key composer is on; set false to fall back to legacy. */
export const nativeComposer = { enabled: true };

export function modelPlaygroundRuntime(projectId: string): ModelPlaygroundRuntime {
  let actorPromise: ReturnType<typeof getActionActor> | undefined;
  const runtime = modelPlaygroundActorRuntime(projectId, () => {
    // Keep one request identity; admission rechecks current membership in SQL.
    actorPromise ??= getActionActor();
    return actorPromise;
  });
  runtime.entrySource = "app";
  return runtime;
}

/** Both entry points share project permissions, write mode and runtime construction. */
export function modelPlaygroundActorRuntime(
  projectId: string,
  loadActor: () => Promise<Actor>,
  expected?: { projectId: string } & (
    | { kind: "project_key"; ownerId: string }
    | { kind: "personal_token" }
  ),
): ModelPlaygroundRuntime {
  return createModelPlaygroundRuntime(prisma, async (action) => {
    const actor = await loadActor();
    // Same create/project permission and write-mode guard as analyzeAiResearchAction.
    const project = await requireProjectScope(
      actor,
      action,
      projectId,
      { type: "project" },
      { allowReadOnly: true },
    );
    if (
      (expected && project.id !== expected.projectId) ||
      (expected?.kind === "project_key" &&
        (typeof expected.ownerId !== "string" ||
          expected.ownerId.length === 0 ||
          project.ownerId !== expected.ownerId)) ||
      (action === "create" && isProjectReadOnly(project.writeMode))
    )
      throw new ModelAdmissionRefusal("access_denied");
    return {
      actorId: actor.id,
      projectId: project.id,
      principal: project.ownerId,
      namespace: meteringNamespace(),
    };
  });
}
