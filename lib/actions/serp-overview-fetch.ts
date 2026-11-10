"use server";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import {
  previewOverviewFetch,
  readSavedOverviewFetch,
} from "@/lib/provider-comparison/overview-fetch";
import { urlRepairTargetSchema } from "@/lib/serp-url-repair/model";
import { z } from "zod";
import { getActionActor, requireProjectScope } from "./_shared";

const schema = z
  .object({
    projectRef: z.string().refine((value) => isPublicIdOfType(value, "prj")),
    target: urlRepairTargetSchema,
  })
  .strict();
export async function previewSerpOverviewFetchAction(input: unknown) {
  const value = schema.parse(input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", value.projectRef, { type: "keyword" });
  return previewOverviewFetch({ projectId: project.id, actorId: actor.id, target: value.target });
}
/** Read-only: the overview already fetched for this source's search, if any. */
export async function readSavedSerpOverviewAction(input: unknown) {
  const value = schema.parse(input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", value.projectRef, { type: "keyword" });
  try {
    return {
      run: await readSavedOverviewFetch({
        projectId: project.id,
        actorId: actor.id,
        target: value.target,
      }),
    };
  } catch {
    // A drifted or missing source simply has no reusable overview.
    return { run: null };
  }
}
