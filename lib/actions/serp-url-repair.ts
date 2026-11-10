"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { urlRepairTargetSchema } from "@/lib/serp-url-repair/model";
import { enqueueUrlRepair, readUrlRepairStatus } from "@/lib/serp-url-repair/service";
import { z } from "zod";
import { getActionActor, requireProjectScope } from "./_shared";

const schema = z
  .object({
    projectRef: z.string().refine((value) => isPublicIdOfType(value, "prj")),
    target: urlRepairTargetSchema,
  })
  .strict();
export async function resolveSerpUrlsAction(input: unknown) {
  const value = schema.parse(input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", value.projectRef, { type: "keyword" });
  const result = await enqueueUrlRepair({
    projectId: project.id,
    actorId: actor.id,
    target: value.target,
  });
  if (result.status === "running") recordAppAction(actor);
  return result;
}
export async function readSerpUrlRepairAction(input: unknown) {
  const value = schema
    .extend({ workflowId: z.string().min(1).max(300) })
    .strict()
    .parse(input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", value.projectRef, { type: "keyword" });
  return readUrlRepairStatus({
    projectId: project.id,
    actorId: actor.id,
    target: value.target,
    workflowId: value.workflowId,
  });
}
