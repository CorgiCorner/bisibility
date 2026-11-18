"use server";

import { recordAppAction } from "@/lib/activity/app-mutation";
import { withScheduleActionResult } from "@/lib/schedules/action-result";
import { dataSyncStatePermission } from "@/lib/schedules/data-sync-permission";
import { setScheduleState } from "@/lib/schedules/mutations";
import { WEB_UNGATED_REVIEW } from "@/lib/schedules/review-commit";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

const syncStateInput = z.object({
  projectId: z.string().min(1).max(120),
  syncKind: z.enum(["domain_rating", "sitemap", "search_console", "page_indexing"]),
  enabled: z.boolean(),
});

export async function setDataSyncScheduleState(input: unknown) {
  return withScheduleActionResult(async () => {
    const { projectId, syncKind, enabled } = parseActionInput(syncStateInput, input);
    const actor = await getActionActor();
    // Each sync keeps the permission of its own control (Domain Rating needs provider admin).
    const permission = dataSyncStatePermission(syncKind);
    const project = await requireProjectScope(actor, permission.action, projectId, {
      type: permission.type,
    });
    await setScheduleState(
      project.id,
      actor,
      `sync:${project.publicId}:${syncKind}`,
      enabled ? "active" : "paused",
      { kind: "data_sync", projectPublicId: project.publicId, syncKind },
      WEB_UNGATED_REVIEW,
    );
    recordAppAction(actor);
    revalidatePath("/app", "layout");
    return { ok: true };
  });
}
