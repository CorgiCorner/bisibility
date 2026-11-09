"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { publishOperationChanged } from "@/lib/notifications/realtime";
import { dismissRecentRun } from "@/lib/rank-check/runs/recent";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const dismissalSchema = z
  .object({
    projectId: z.string().refine((value) => isPublicIdOfType(value, "prj")),
    runId: z.string().refine((value) => isPublicIdOfType(value, "rcr")),
  })
  .strict();

export async function dismissTrayRun(input: unknown) {
  const data = parseActionInput(dismissalSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "read", data.projectId, { type: "project" });
  const result = await dismissRecentRun(project.id, actor.id, data.runId);
  if (result.dismissed) await publishOperationChanged({ projectId: project.id }).catch(() => {});
  if (result.dismissed) recordAppAction(actor);
  return result;
}
