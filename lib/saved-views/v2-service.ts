import "server-only";

import { parseActionInput, revalidateKeywordViews } from "@/lib/actions/_shared";
import { prisma } from "@/lib/db/prisma";
import { savedViewProjectScope, type ViewDatabase } from "./access";
import {
  createSavedViewV2Schema,
  deleteSavedViewV2Schema,
  updateSavedViewV2Schema,
} from "./canonical-model";
import { personalSessionUserId, type SavedViewContext } from "./context";
import { createViewInTransaction } from "./creation";
import {
  auditViewMutation,
  canonicalResource,
  deleteViewInTransaction,
  updateViewInTransaction,
} from "./mutations";

/** V2 is a session-only display operation, including explicitly shared Save as. */
export async function createSavedViewV2For(
  input: unknown,
  context: SavedViewContext,
  db: ViewDatabase = prisma,
) {
  const data = parseActionInput(createSavedViewV2Schema, input);
  personalSessionUserId(context);
  const result = await db.$transaction(async (tx) => {
    const scope = await savedViewProjectScope(tx, context, data.projectId);
    const { replayed, view } = await createViewInTransaction(tx, scope, context, data);
    if (!replayed) await auditViewMutation(tx, scope, context, "create", view);
    return canonicalResource(view, scope);
  });
  revalidateKeywordViews();
  return result;
}

export async function updateSavedViewV2For(
  input: unknown,
  context: SavedViewContext,
  db: ViewDatabase = prisma,
) {
  const data = parseActionInput(updateSavedViewV2Schema, input);
  personalSessionUserId(context);
  const result = await db.$transaction(async (tx) =>
    updateViewInTransaction(
      tx,
      await savedViewProjectScope(tx, context, data.projectId),
      context,
      data,
    ),
  );
  revalidateKeywordViews();
  return result;
}

export async function deleteSavedViewV2For(
  input: unknown,
  context: SavedViewContext,
  db: ViewDatabase = prisma,
) {
  const data = parseActionInput(deleteSavedViewV2Schema, input);
  personalSessionUserId(context);
  const result = await db.$transaction(async (tx) =>
    deleteViewInTransaction(
      tx,
      await savedViewProjectScope(tx, context, data.projectId),
      context,
      data.viewId,
      data.expectedRevision,
    ),
  );
  revalidateKeywordViews();
  return result;
}
