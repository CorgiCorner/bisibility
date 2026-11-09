"use server";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { withCapacityFailure } from "@/lib/capacity/action";
import { createProjectMarket as createProjectMarketTransaction } from "@/lib/markets/create";
import { newMarketCreateSchema } from "@/lib/markets/create-input";
import { revalidatePath } from "next/cache";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

export async function createProjectMarket(input: unknown) {
  return withCapacityFailure(async () => {
    const data = parseActionInput(newMarketCreateSchema, input);
    const actor = await getActionActor();
    const project = await requireProjectScope(actor, "create", data.projectId, {
      type: "project_market",
    });
    const result = await createProjectMarketTransaction(actor.id, project.id, data);
    recordAppAction(actor);
    revalidatePath(`/app/${data.projectId}/markets`);

    return result;
  });
}
