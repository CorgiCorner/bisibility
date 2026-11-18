"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { withCapacityFailure } from "@/lib/capacity/action";
import { createProjectMarket as createProjectMarketTransaction } from "@/lib/markets/create";
import { newMarketCreateSchema } from "@/lib/markets/create-input";
import { withScheduleActionResult } from "@/lib/schedules/action-result";
import { splitScheduleReview } from "@/lib/schemas/schedule-review";
import { revalidatePath } from "next/cache";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

export async function createProjectMarket(input: unknown) {
  return withScheduleActionResult(() =>
    withCapacityFailure(async () => {
      const { body, review } = splitScheduleReview(input);
      const data = parseActionInput(newMarketCreateSchema, body);
      const actor = await getActionActor();
      const project = await requireProjectScope(actor, "create", data.projectId, {
        type: "project_market",
      });
      const result = await createProjectMarketTransaction(actor.id, project.id, {
        ...data,
        ...(review ? { review } : {}),
      });
      recordAppAction(actor);
      revalidatePath(`/app/${data.projectId}/markets`);

      return result;
    }),
  );
}
