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

const updateProjectBudgetSchema = z
  .object({
    capCents: z.number().int().positive().max(MAX_BUDGET_CAP_CENTS).nullable(),
    funding: z.enum(["byok", "platform"]).default("byok"),
    projectId: z.string().trim().min(1).max(120),
  })
  // Your keys always keep a limit; the Credits limit is optional within the wallet.
  .refine((data) => data.funding === "platform" || data.capCents !== null, {
    path: ["capCents"],
  });

/**
 * Updates a per-project monthly limit. Owner/admin only: the "manage" action on
 * the project resource requires at least the admin role.
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
      funding: data.funding,
    }),
  );
  revalidateBudgetViews();

  return updated;
}
