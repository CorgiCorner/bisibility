import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { type Budget, formatQuantity, type Quantity, resolveWindow } from "@usagekit/core";
import {
  type ProjectFunding,
  projectBudgetId,
  projectFundingBudget,
  projectFundingBudgetId,
  projectFundingBudgetScopes,
  projectFundingUnit,
} from "./project-funding-budgets";
import { projectSpendingBudget } from "./spending-limits";
import { contribution, currentBudgets, lockScopes, saveBudget } from "./store/budgets";
import { plus } from "./store/codec";
import { createSql, Prisma as Sql } from "./store/host-sql";
import { hydrate, type OperationRow } from "./store/records";

type Tx = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">;
const sqlFor = (tx: Tx) =>
  createSql(tx as Prisma.TransactionClient, { statements: 0, changes: 0n, rowsRead: 0 });

export type FundingBackfill = { epoch: string; amount: string; operations: number };

/**
 * Operations bind budgets when reserved, so a budget created mid-month never sees earlier work.
 * Count this epoch's work of one funding source from the group budget instead. Open reservations
 * count as used because they will never settle into the new budget: this may over-count a later
 * release, never under-count spending.
 */
async function backfillFundingUsage(
  tx: Tx,
  group: Budget,
  target: Budget,
  funding: ProjectFunding,
  now: Date,
): Promise<FundingBackfill> {
  const sql = sqlFor(tx);
  const epoch = resolveWindow(group.window, now).epoch;
  const rows = await sql.query<OperationRow>(
    Sql.sql`SELECT o.* FROM metering_operation o WHERE o.namespace=${group.scope.namespace}
      AND o.budget_epochs @> ${JSON.stringify([{ budgetId: group.id, epoch }])}::jsonb
      AND o.input->>'fundingSource'=${funding} ORDER BY o.operation_pk`,
  );
  const unit = projectFundingUnit(funding);
  let total: Quantity = { value: 0n, scale: 0, unit };
  for (const row of rows) {
    const amounts = contribution(await hydrate(sql, row), unit);
    total = plus(plus(total, amounts.used), amounts.reserved);
  }
  if (total.value !== 0n)
    await sql.execute(Sql.sql`INSERT INTO metering_budget_usage(namespace,budget_id,epoch,settled_value,outstanding_value,scale)
      VALUES(${target.scope.namespace},${target.id},${epoch},${total.value.toString()}::numeric,0,${total.scale})`);
  return { epoch, amount: formatQuantity(total), operations: rows.length };
}

async function lockedProjectBudgets(tx: Tx, namespace: string, projectId: string) {
  const sql = sqlFor(tx);
  const scopes = [
    { kind: "group" as const, namespace, group: projectId },
    ...projectFundingBudgetScopes(namespace, projectId),
  ];
  await sql.adoptTimestampContract();
  // Admission locks the same scope keys, so no reservation interleaves with the split.
  await lockScopes(sql, scopes);
  return { sql, budgets: await currentBudgets(sql, namespace, scopes) };
}

async function save(tx: Tx, budget: Budget) {
  const result = await saveBudget(sqlFor(tx), budget);
  if (result.outcome !== "saved") throw new Error("Concurrent spending limit update");
  return result.budget;
}

export type ProjectFundingSplit =
  | { outcome: "already_split"; projectId: string }
  | {
      outcome: "split";
      projectId: string;
      groupVersion: number;
      limit: string | null;
      backfill: FundingBackfill;
      creditsBackfill: FundingBackfill | null;
    };

/** Move the shared project cap to the your-key budget; Credits stay bounded by the wallet. */
export async function splitProjectFundingLimits(
  tx: Tx,
  namespace: string,
  projectId: string,
  now = new Date(),
): Promise<ProjectFundingSplit> {
  const { budgets } = await lockedProjectBudgets(tx, namespace, projectId);
  if (budgets.some((b) => b.id === projectFundingBudgetId("byok", projectId)))
    return { outcome: "already_split", projectId };
  const group = budgets.find((b) => b.id === projectBudgetId(projectId));
  if (!group) throw new Error("Project spending budget is missing");
  const own = await save(tx, {
    ...projectFundingBudget(namespace, projectId, "byok", null, 1),
    limit: group.limit,
  });
  const backfill = await backfillFundingUsage(tx, group, own, "byok", now);
  // Credits start without a project limit; the wallet balance still bounds them.
  const credits = budgets.find((b) => b.id === projectFundingBudgetId("platform", projectId));
  const creditsBackfill = credits
    ? null
    : await backfillFundingUsage(
        tx,
        group,
        await save(tx, projectFundingBudget(namespace, projectId, "platform", null, 1)),
        "platform",
        now,
      );
  // The group budget remains the admission existence marker, without a shared limit.
  await save(tx, projectSpendingBudget(namespace, projectId, null, group.version + 1));
  return {
    outcome: "split",
    projectId,
    groupVersion: group.version + 1,
    limit: group.limit ? formatQuantity(group.limit) : null,
    backfill,
    creditsBackfill,
  };
}

/** Change one funding limit; a budget created here first counts this month's work. */
export async function putProjectFundingLimit(
  tx: Tx,
  namespace: string,
  projectId: string,
  funding: ProjectFunding,
  capCents: string | null,
  now = new Date(),
) {
  const { budgets } = await lockedProjectBudgets(tx, namespace, projectId);
  if (!budgets.some((b) => b.id === projectFundingBudgetId("byok", projectId)))
    throw new Error("Project funding limits are not split");
  const current = budgets.find((b) => b.id === projectFundingBudgetId(funding, projectId));
  const group = budgets.find((b) => b.id === projectBudgetId(projectId));
  if (!group) throw new Error("Project spending budget is missing");
  const budget = await save(
    tx,
    projectFundingBudget(namespace, projectId, funding, capCents, (current?.version ?? 0) + 1),
  );
  const backfill = current ? null : await backfillFundingUsage(tx, group, budget, funding, now);
  return { before: current ?? null, after: budget, backfill };
}
