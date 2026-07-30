"use server";

import { writeAudit } from "@/lib/auth/audit";
import { authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType, makePublicId } from "@/lib/db/public-id";
import {
  type CreateSavedViewInput,
  deleteSavedViewSchema,
  type KeywordSavedView,
} from "@/lib/keywords/saved-view-model";
import {
  type CreateProjectSavedViewInput,
  createProjectSavedViewSchema,
  mapSavedViewRecord,
  type SavedViewResource,
} from "@/lib/saved-views/model";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateKeywordViews,
} from "./_shared";

export function createSavedView(input: CreateSavedViewInput): Promise<KeywordSavedView>;
export function createSavedView(input: CreateProjectSavedViewInput): Promise<SavedViewResource>;
export function createSavedView(input: unknown): Promise<SavedViewResource>;
export async function createSavedView(input: unknown): Promise<SavedViewResource> {
  const data = parseActionInput(createProjectSavedViewSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, {
    type: "saved_view",
  });
  const view = await prisma.savedView.create({
    data: {
      config: data.config,
      createdById: actor.id,
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
    actorId: actor.id,
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

export async function deleteSavedView(input: unknown) {
  const data = parseActionInput(deleteSavedViewSchema, input);
  const actor = await getActionActor();
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

  authorize(actor, view.createdById === actor.id ? "update" : "delete", {
    projectId: project.id,
    type: "saved_view",
  });
  await prisma.savedView.delete({ where: { id: view.id } });
  const viewId = requiredPublicId(view.publicId);
  await writeAudit({
    action: "saved_view.delete",
    actorId: actor.id,
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
