import "server-only";

import { parseActionInput, revalidateKeywordViews } from "@/lib/actions/_shared";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { deleteSavedViewSchema } from "@/lib/keywords/saved-view-model";
import { savedViewAccess, savedViewProjectScope, type ViewDatabase } from "./access";
import type { SavedViewContext } from "./context";
import { createViewInTransaction } from "./creation";
import { SavedViewUnavailableError } from "./errors";
import { createProjectSavedViewSchema, mapSavedViewRecord, type SavedViewResource } from "./model";
import { auditViewMutation, deleteViewInTransaction } from "./mutations";

/** V1 remains explicitly shared; an omitted legacy transport never borrows a session. */
export async function createSavedViewFor(
  input: unknown,
  context: SavedViewContext,
  db: ViewDatabase = prisma,
): Promise<SavedViewResource> {
  const data = parseActionInput(createProjectSavedViewSchema, input);
  const result = await db.$transaction(async (tx) => {
    const scope = await savedViewProjectScope(tx, context, data.projectId);
    const { view } = await createViewInTransaction(tx, scope, context, {
      ...data,
      visibility: "project",
    });
    await auditViewMutation(tx, scope, context, "create", view);
    const resource = mapSavedViewRecord(
      view,
      savedViewAccess(scope.actor, scope.project.id, view, scope.project.writeMode).canDelete,
    );
    if (!resource) throw new SavedViewUnavailableError();
    return resource;
  });
  revalidateKeywordViews();
  return result;
}

export async function deleteSavedViewFor(
  input: unknown,
  context: SavedViewContext,
  db: ViewDatabase = prisma,
) {
  const data = parseActionInput(deleteSavedViewSchema.strict(), input);
  // Legacy transport never deletes private resources, even with a matching actor ID.
  const legacyContext = {
    actor: context.actor,
    auditActorId: context.auditActorId,
    transport: "project_api" as const,
  };
  const result = await db.$transaction(async (tx) => {
    const scope = await savedViewProjectScope(tx, context, data.projectId);
    return isPublicIdOfType(data.viewId, "viw")
      ? deleteViewInTransaction(tx, scope, legacyContext, data.viewId)
      : { deleted: false };
  });
  revalidateKeywordViews();
  return result;
}
