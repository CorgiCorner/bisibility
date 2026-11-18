"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { domainRatingSettingsSchema } from "@/lib/domain-rating/settings";
import { withScheduleActionResult } from "@/lib/schedules/action-result";
import { dataSyncStatePermission } from "@/lib/schedules/data-sync-permission";
import { setScheduleState } from "@/lib/schedules/mutations";
import { WEB_UNGATED_REVIEW } from "@/lib/schedules/review-commit";
import { revalidatePath } from "next/cache";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

export async function setDomainRatingTracking(input: unknown) {
  return withScheduleActionResult(async () => {
    const data = parseActionInput(domainRatingSettingsSchema, input);
    const actor = await getActionActor();
    const permission = dataSyncStatePermission("domain_rating");
    const project = await requireProjectScope(actor, permission.action, data.projectId, {
      type: permission.type,
    });
    await setScheduleState(
      project.id,
      actor,
      `sync:${project.publicId}:domain_rating`,
      data.enabled ? "active" : "paused",
      { kind: "data_sync", projectPublicId: project.publicId, syncKind: "domain_rating" },
      WEB_UNGATED_REVIEW,
    );
    recordAppAction(actor);
    revalidatePath("/app", "layout");

    return { ok: true };
  });
}
