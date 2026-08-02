"use server";

import { appPath } from "@/lib/routing/app-path";
import { removeSavedKeywordRows, saveSavedKeywordRows } from "@/lib/saved-keywords/service";
import { removeSavedKeywordsSchema, saveKeywordsSchema } from "@/lib/schemas/saved-keyword";
import { revalidatePath } from "next/cache";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

function revalidateSavedKeywords(projectRef: string) {
  revalidatePath(appPath(projectRef, "keywords"));
  revalidatePath(appPath(projectRef, "research"));
}

export async function saveKeywords(input: unknown) {
  const data = parseActionInput(saveKeywordsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, {
    type: "keyword",
  });
  const { results: _results, ...outcome } = await saveSavedKeywordRows(data.rows, {
    actorId: actor.id,
    projectId: project.id,
    projectPublicId: project.publicId,
  });
  revalidateSavedKeywords(project.publicId);
  return outcome;
}

export async function removeSavedKeywords(input: unknown) {
  const data = parseActionInput(removeSavedKeywordsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "delete", data.projectId, {
    type: "keyword",
  });
  const { removedCount } = await removeSavedKeywordRows(
    "publicIds" in data ? { publicIds: data.publicIds } : { rows: data.rows },
    {
      actorId: actor.id,
      projectId: project.id,
      projectPublicId: project.publicId,
    },
  );
  revalidateSavedKeywords(project.publicId);
  return { removedCount };
}
