"use server";

import {
  getActionActor,
  parseActionInput,
  requireProjectScope,
  revalidateBudgetViews,
} from "@/lib/actions/_shared";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
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
  const before = await prisma.project.findUnique({
    select: { budgetCapCents: true },
    where: { id: project.id },
  });
  if (!before) {
    throw new Error("Project not found.");
  }

  const updated = await prisma.project.update({
    data: { budgetCapCents: data.capCents },
    select: { budgetCapCents: true },
    where: { id: project.id },
  });

  await writeAudit({
    action: "settings.budget_updated",
    actorId: actor.id,
    after: { capCents: updated.budgetCapCents },
    before: { capCents: before.budgetCapCents },
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project",
  });
  revalidateBudgetViews();

  return { capCents: updated.budgetCapCents };
}
