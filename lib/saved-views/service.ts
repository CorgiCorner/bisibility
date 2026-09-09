import "server-only";

import {
  parseActionInput,
  requireProjectScope,
  revalidateKeywordViews,
} from "@/lib/actions/_shared";
import { writeAudit } from "@/lib/auth/audit";
import { type Actor, authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType, makePublicId } from "@/lib/db/public-id";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import { deleteSavedViewSchema } from "@/lib/keywords/saved-view-model";
import {
  createProjectSavedViewSchema,
  mapSavedViewRecord,
  type SavedViewResource,
} from "@/lib/saved-views/model";

export async function createSavedViewFor(
  input: unknown,
  context: { actor: Actor; auditActorId: string | null },
): Promise<SavedViewResource> {
  const data = parseActionInput(createProjectSavedViewSchema, input);
  const { actor } = context;
  const project = await requireProjectScope(actor, "create", data.projectId, {
    type: "saved_view",
  });
  const view = await prisma.savedView.create({
    data: {
      config: data.config,
      createdById: context.auditActorId,
      name: data.name,
      publicId: makePublicId("viw"),
      projectId: project.id,
      surface: data.config.surface,
    },
    select: {
      config: true,
      createdAt: true,
      createdById: true,
      id: true,
      name: true,
      publicId: true,
      surface: true,
    },
  });

  const viewId = requiredPublicId(view.publicId);
  await writeAudit({
    action: "saved_view.create",
    actorId: context.auditActorId,
    after: { name: view.name, savedViewId: viewId, surface: view.surface },
    projectId: project.id,
    targetId: viewId,
    targetType: "saved_view",
  });
  revalidateKeywordViews();

  const mapped = mapSavedViewRecord(view, true);
  if (!mapped) throw new Error("The saved view config did not match its surface.");
  return mapped;
}

export async function deleteSavedViewFor(
  input: unknown,
  context: { actor: Actor; auditActorId: string | null },
) {
  const data = parseActionInput(deleteSavedViewSchema, input);
  const { actor } = context;
  const project = await requireProjectScope(actor, "read", data.projectId, {
    type: "saved_view",
  });
  if (!isPublicIdOfType(data.viewId, "viw")) return { deleted: false };
  const view = await prisma.savedView.findFirst({
    select: { createdById: true, id: true, name: true, publicId: true, surface: true },
    where: { projectId: project.id, publicId: data.viewId },
  });

  if (!view) {
    return { deleted: false };
  }

  authorize(
    actor,
    context.auditActorId !== null && view.createdById === context.auditActorId
      ? "update"
      : "delete",
    {
      projectId: project.id,
      type: "saved_view",
    },
  );
  assertProjectWritable(project);
  await prisma.savedView.delete({ where: { id: view.id } });
  const viewId = requiredPublicId(view.publicId);
  await writeAudit({
    action: "saved_view.delete",
    actorId: context.auditActorId,
    before: { name: view.name, savedViewId: viewId, surface: view.surface },
    projectId: project.id,
    targetId: viewId,
    targetType: "saved_view",
  });
  revalidateKeywordViews();

  return { deleted: true };
}

function requiredPublicId(value: string | null) {
  if (!value || !isPublicIdOfType(value, "viw")) {
    throw new Error("Saved view public ID is not available.");
  }
  return value;
}
