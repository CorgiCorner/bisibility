"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateBudgetViews,
} from "@/lib/actions/_shared";
import { prisma } from "@/lib/db/prisma";
import { setProjectSpendingLimit } from "@/lib/metering/project-spending-limit";
import { z } from "zod";

const MAX_BUDGET_CAP_CENTS = 100_000_000;

const updateProjectBudgetSchema = z.object({
  capCents: z.number().int().positive().max(MAX_BUDGET_CAP_CENTS),
  projectId: z.string().trim().min(1).max(120),
});

/**
 * Updates the per-project monthly provider budget cap. Owner/admin only: the
 * "manage" action on the project resource requires at least the admin role.
 */
export async function updateProjectBudgetAction(input: unknown) {
  const data = parseActionInput(updateProjectBudgetSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", data.projectId, { type: "project" });
  const updated = await prisma.$transaction((tx) =>
    setProjectSpendingLimit(tx, {
      actor,
      projectPublicId: project.publicId,
      capCents: data.capCents,
    }),
  );
  revalidateBudgetViews();

  return updated;
}
