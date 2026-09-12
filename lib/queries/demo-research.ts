import "server-only";

import { loadConfiguredDemoActor } from "@/lib/demo/identity";
import { isEditableDemoResearchProject } from "@/lib/demo/research-storage";
import { getQueryActor, requireReadableProjectFor } from "./_auth";

export type DemoResearchAccess = {
  actorKind: "owner" | "viewer";
  project: { id: string; publicId: string };
};

/** Resolves the exact configured actor through the normal project RBAC boundary. */
export async function getDemoResearchAccess(
  projectPublicId: string,
): Promise<DemoResearchAccess | null> {
  const actor = await getQueryActor();
  const { project } = await requireReadableProjectFor(actor, projectPublicId);
  if (!isEditableDemoResearchProject(project.publicId)) return null;

  const configuredActor = await loadConfiguredDemoActor(actor.id);
  if (!configuredActor) return null;

  return {
    actorKind: configuredActor.kind,
    project: { id: project.id, publicId: project.publicId },
  };
}
