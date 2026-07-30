"use server";

import { syncProjectTrafficNow } from "@/lib/traffic/sync-now";
import { z } from "zod";
import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateKeywordViews,
} from "./_shared";

const syncProjectTrafficSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
});

export type SyncProjectTrafficInput = z.infer<typeof syncProjectTrafficSchema>;

export async function syncProjectTraffic(input: unknown) {
  const data = parseActionInput(syncProjectTrafficSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "project" });
  const summary = await syncProjectTrafficNow({ actorId: actor.id, projectId: project.id });
  revalidateKeywordViews();

  return summary;
}
