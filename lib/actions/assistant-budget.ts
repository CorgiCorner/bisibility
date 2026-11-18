"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateBudgetViews,
} from "@/lib/actions/_shared";
import { recordAppAction } from "@/lib/activity/app-mutation";
import { setAssistantProjectLimit } from "@/lib/assistant/funding-extension";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";

const schema = z.object({
  capCents: z.number().int().positive().max(100_000_000).nullable(),
  projectId: z.string().trim().min(1).max(120),
});

/** Sets the project AI credits cap. Manage permission is required; an empty cap removes it. */
export async function updateAssistantProjectLimitAction(input: unknown) {
  const data = parseActionInput(schema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, { type: "project" });
  const updated = await prisma.$transaction((tx) =>
    setAssistantProjectLimit(tx, {
      actor,
      projectId: project.id,
      projectPublicId: project.publicId,
      capCents: data.capCents,
    }),
  );
  recordAppAction(actor);
  revalidateBudgetViews();
  return updated;
}
