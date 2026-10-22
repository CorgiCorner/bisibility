import "server-only";
import { requireApiPublicId } from "@/lib/api/public-id";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { type Actor, authorize } from "@/lib/auth/authorize";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { formatQuantity } from "@usagekit/core";
import {
  type ProjectFunding,
  projectBudgetId,
  projectFundingBudgetId,
  projectFundingBudgetScopes,
} from "./project-funding-budgets";
import { putProjectFundingLimit } from "./project-funding-split";
import { meteringNamespace } from "./runtime";
import { putSpendingBudget, readSpendingBudgets } from "./spending-limit-store";
import { projectSpendingBudget } from "./spending-limits";

export async function setProjectSpendingLimit(
  tx: Prisma.TransactionClient,
  input: {
    actor: Actor;
    projectPublicId: string;
    capCents: number | null;
    /** Split projects limit each source; unsplit projects have one your-key cap. */
    funding?: ProjectFunding;
  },
) {
  const funding = input.funding ?? "byok";
  requireApiPublicId(input.projectPublicId, "prj");
  if (
    input.capCents !== null &&
    (!Number.isSafeInteger(input.capCents) || input.capCents < 0 || input.capCents > 100000000)
  )
    throw new RangeError("Invalid project spending limit");
  const reference = await tx.project.findUnique({
    where: { publicId: input.projectPublicId },
    select: { id: true },
  });
  if (!reference) throw new Error("Project not found.");
  await lockProjectForProviderMutation(tx, reference.id);
  const project = await tx.project.findUniqueOrThrow({
    where: { id: reference.id },
    select: { id: true, publicId: true, isSample: true, writeMode: true },
  });
  authorize(input.actor, "manage", { projectId: project.id, type: "project" });
  assertProjectWritable(project);
  const namespace = meteringNamespace();
  const budgets = await readSpendingBudgets(tx, namespace, [
    { kind: "group", namespace, group: project.id },
    ...projectFundingBudgetScopes(namespace, project.id),
  ]);
  const cap = input.capCents === null ? null : String(input.capCents);
  const split = budgets.some((b) => b.id === projectFundingBudgetId("byok", project.id));
  if (!split && funding === "platform")
    throw new Error("Credits limits require separate project funding limits.");
  const current = budgets.find((b) =>
    split
      ? b.id === projectFundingBudgetId(funding, project.id)
      : b.id === projectBudgetId(project.id),
  );
  const budget = split
    ? (await putProjectFundingLimit(tx, namespace, project.id, funding, cap)).after
    : await putSpendingBudget(
        tx,
        projectSpendingBudget(namespace, project.id, cap, (current?.version ?? 0) + 1),
      );
  const capCents = budget.limit ? Number(formatQuantity(budget.limit)) : null;
  await writeAudit(
    {
      action: "settings.budget_updated",
      actorId: input.actor.id,
      before: { capCents: current?.limit ? Number(formatQuantity(current.limit)) : null },
      after: { capCents, ...(split ? { funding } : {}) },
      projectId: project.id,
      targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
      targetType: "project",
    },
    tx,
  );
  return { capCents };
}
