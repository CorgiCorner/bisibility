"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateSettingsViews,
} from "@/lib/actions/_shared";
import {
  deleteProjectById,
  readActorProjects,
  readProjectDeleteSnapshot,
  readProjectSettingsSnapshot,
  updateProjectSettingsSnapshot,
} from "@/lib/actions/project";
import { joinWaitlist } from "@/lib/actions/waitlist";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { waitlistSchema } from "@/lib/landing/waitlist-schema";
import { createProjectSchema, normalizeTrackingScope } from "@/lib/schemas/project";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const idSchema = z.string().trim().min(1).max(120);

const updateProjectSchema = createProjectSchema.pick({ domain: true, name: true }).extend({
  projectId: idSchema,
});

const deleteWorkspaceSchema = z.object({
  confirmText: z.string().trim().min(1).max(253),
  projectId: idSchema,
});
const billingInterestSchema = waitlistSchema.and(z.object({ projectId: idSchema }));

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type DeleteWorkspaceInput = z.infer<typeof deleteWorkspaceSchema>;
export type DeleteWorkspaceResult = {
  hasRemainingWorkspace: boolean;
  id: string;
  nextProjectPublicId: string | null;
};
export type BillingInterestInput = z.infer<typeof billingInterestSchema>;

export async function updateProject(input: unknown) {
  const data = parseActionInput(updateProjectSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const before = await readProjectSettingsSnapshot(project.id);

  if (!before) {
    throw new Error("Project not found.");
  }

  const updated = await updateProjectSettingsSnapshot(project.id, data);

  await writeAudit({
    action: "project.update",
    actorId: actor.id,
    after: updated,
    before,
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project",
  });
  revalidateSettingsViews();

  return {
    domain: updated.domain,
    name: updated.name,
    projectId: updated.publicId,
    trackingScope: normalizeTrackingScope(updated.trackingScope),
  };
}

export async function deleteWorkspace(input: unknown) {
  const data = parseActionInput(deleteWorkspaceSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "delete", data.projectId, { type: "project" });
  const before = await readProjectDeleteSnapshot(project.id);

  if (!before) {
    throw new Error("Workspace not found.");
  }

  const expected = before.domain || before.publicId;
  if (data.confirmText !== expected) {
    throw new Error("Confirmation text does not match this workspace.");
  }

  await writeAudit({
    action: "project.delete",
    actorId: actor.id,
    before,
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project",
  });

  await deleteProjectById(project.id);
  const nextProject = (await readActorProjects(actor.id))[0] ?? null;

  revalidateSettingsViews();
  revalidatePath("/onboarding");

  return {
    hasRemainingWorkspace: Boolean(nextProject),
    id: project.publicId,
    nextProjectPublicId: nextProject?.publicId ?? null,
  } satisfies DeleteWorkspaceResult;
}

export async function submitBillingInterest(input: unknown) {
  const data = parseActionInput(billingInterestSchema, input);
  const actor = await getActionActor();
  await requireProjectScope(actor, "manage", data.projectId, { type: "billing" });

  return joinWaitlist(data);
}
