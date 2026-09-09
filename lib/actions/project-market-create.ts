"use server";

import { createProjectMarket as createProjectMarketTransaction } from "@/lib/markets/create";
import { newMarketCreateSchema } from "@/lib/markets/create-input";
import { revalidatePath } from "next/cache";
import { getActionActor, parseActionInput, requireProjectScope } from "./_shared";

export async function createProjectMarket(input: unknown) {
  const data = parseActionInput(newMarketCreateSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, {
    type: "project_market",
  });
  const result = await createProjectMarketTransaction(actor.id, project.id, data);
  revalidatePath(`/app/${data.projectId}/markets`);
  return result;
}
