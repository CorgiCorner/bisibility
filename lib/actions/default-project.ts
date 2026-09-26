"use server";

import { getActionActor } from "@/lib/actions/_shared";
import type { ActionFailureResult, ActionResult } from "@/lib/actions/action-result";
import { writeAudit } from "@/lib/auth/audit";
import { AuthorizationError, authorize } from "@/lib/auth/authorize";
import { requireMutableAccountSession } from "@/lib/demo/mutable-account-session";
import {
  type DefaultProjectTarget,
  findDefaultProjectCandidate,
  persistDefaultProject,
} from "@/lib/queries/default-project";
import { defaultProjectInputSchema } from "@/lib/schemas/default-project";

const PROJECT_NOT_FOUND: ActionFailureResult = {
  error: { code: "not_found", message: "Project not found.", status: 404 },
  ok: false,
};

function invalidInput(message: string): ActionFailureResult {
  return { error: { code: "invalid_input", message, status: 400 }, ok: false };
}

// A project the actor cannot read answers exactly like a missing one.
async function resolveTarget(
  projectId: string,
): Promise<DefaultProjectTarget | ActionFailureResult> {
  const [actor, project] = await Promise.all([
    getActionActor(),
    findDefaultProjectCandidate(projectId),
  ]);
  if (!project) return PROJECT_NOT_FOUND;
  try {
    authorize(actor, "read", { projectId: project.id, type: "project" });
  } catch (error) {
    if (error instanceof AuthorizationError) return PROJECT_NOT_FOUND;
    throw error;
  }
  // The entry page only opens projects that finished onboarding, so nothing else can be default.
  if (!project.onboardingCompletedAt) {
    return invalidInput("Finish setting up this project before making it the default.");
  }
  return { id: project.id, publicId: project.publicId };
}

/** Sets (or, with `projectId: null`, clears) the project the app opens first after sign-in. */
export async function setDefaultProject(
  input: unknown,
): Promise<ActionResult<{ projectId: string | null }>> {
  const session = await requireMutableAccountSession();
  const parsed = defaultProjectInputSchema.safeParse(input);
  if (!parsed.success) return invalidInput("Choose a project.");

  const target = parsed.data.projectId ? await resolveTarget(parsed.data.projectId) : null;
  if (target && "ok" in target) return target;

  const result = await persistDefaultProject(session.user.id, target);
  const projectId = target?.publicId ?? null;
  if (result.changed) {
    await writeAudit({
      action: "user.default_project.update",
      actorId: session.user.id,
      after: { defaultProjectId: projectId },
      before: { defaultProjectId: result.previousProjectId },
      targetId: result.publicId,
      targetType: "user",
    });
  }
  return { ok: true, value: { projectId } };
}
