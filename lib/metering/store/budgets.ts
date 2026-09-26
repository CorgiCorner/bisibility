import type {
  ApplicableBudgetsQuery,
  Budget,
  BudgetScope,
  BudgetStatus,
  Operation,
  Quantity,
} from "@usagekit/core";
import { resolveWindow } from "@usagekit/core";
import { canonical, decode, effective, encode, plus } from "./codec";
import { lock, Prisma, type Sql } from "./sql";

export function matchingScopes(
  q: Pick<ApplicableBudgetsQuery, "scope" | "platformPools">,
): BudgetScope[] {
  const { namespace, principal, connection, group, accessCredential } = q.scope;
  return [
    { kind: "principal", namespace, principal },
    { kind: "connection", namespace, connection },
    ...(group ? [{ kind: "group" as const, namespace, group }] : []),
    ...(accessCredential
      ? [{ kind: "access_credential" as const, namespace, accessCredential }]
      : []),
    ...(q.platformPools ?? []).map((poolId) => ({
      kind: "platform_pool" as const,
      namespace,
      poolId,
    })),
  ];
}
export async function lockScopes(sql: Sql, scopes: BudgetScope[]) {
  for (const value of [...new Set(scopes.map(canonical))].sort())
    await lock(sql, `metering:scope:${value}`);
}
export async function currentBudgets(
  sql: Sql,
  namespace: string,
  scopes?: BudgetScope[],
  surface?: string,
) {
  const clauses = [
    Prisma.sql`b.namespace=${namespace}`,
    Prisma.sql`NOT EXISTS(SELECT 1 FROM metering_budget n WHERE n.namespace=b.namespace AND n.budget_id=b.budget_id AND n.version>b.version)`,
  ];
  if (scopes) clauses.push(Prisma.sql`b.scope_key IN (${Prisma.join(scopes.map(canonical))})`);
  if (surface) clauses.push(Prisma.sql`b.surface IN ('any',${surface})`);
  const rows = await sql.query<{ body: unknown }>(
    Prisma.sql`SELECT b.body FROM metering_budget b WHERE ${Prisma.join(clauses, " AND ")} ORDER BY b.sequence`,
  );
  return rows.map((r) => decode<Budget>(r.body));
}
export async function historicalBudget(sql: Sql, namespace: string, id: string, version: number) {
  const [row] = await sql.query<{ body: unknown }>(
    Prisma.sql`SELECT body FROM metering_budget WHERE namespace=${namespace} AND budget_id=${id} AND version=${version}`,
  );
  if (!row) throw new Error("Missing metering budget history");
  return decode<Budget>(row.body);
}
export async function usage(sql: Sql, budget: Budget, epoch: string) {
  const [row] = await sql.query<{
    settled_value: { toString(): string };
    outstanding_value: { toString(): string };
    scale: number;
  }>(Prisma.sql`
    SELECT settled_value,outstanding_value,scale FROM metering_budget_usage WHERE namespace=${budget.scope.namespace} AND budget_id=${budget.id} AND epoch=${epoch}`);
  const used = {
    value: BigInt(row?.settled_value.toString() ?? "0"),
    scale: row?.scale ?? 0,
    unit: budget.unit,
  };
  return { used, reserved: { ...used, value: BigInt(row?.outstanding_value.toString() ?? "0") } };
}
export async function status(sql: Sql, budget: Budget, now: Date): Promise<BudgetStatus> {
  const epoch = resolveWindow(budget.window, now),
    amounts = await usage(sql, budget, epoch.epoch);
  const total = plus(amounts.used, amounts.reserved);
  return {
    budget,
    epoch,
    ...amounts,
    remaining: budget.limit ? plus(budget.limit, { ...total, value: -total.value }) : null,
  };
}
export function contribution(op: Operation | null, unit: string) {
  const zero: Quantity = { value: 0n, scale: 0, unit };
  return {
    used:
      op?.state === "settled"
        ? (effective(op)?.measurements.find((m) => m.unit === unit)?.quantity ?? zero)
        : zero,
    reserved:
      op && op.state !== "settled" && op.state !== "released"
        ? (op.estimate.find((q) => q.unit === unit) ?? zero)
        : zero,
  };
}
export function difference(before: Operation | null, after: Operation, unit: string) {
  const a = contribution(before, unit),
    b = contribution(after, unit);
  return {
    used: plus(b.used, { ...a.used, value: -a.used.value }),
    reserved: plus(b.reserved, { ...a.reserved, value: -a.reserved.value }),
  };
}
export async function updateUsage(sql: Sql, before: Operation | null, after: Operation) {
  for (const epoch of after.budgetEpochs) {
    const b = await historicalBudget(
      sql,
      after.scope.namespace,
      epoch.budgetId,
      epoch.budgetVersion,
    );
    const delta = difference(before, after, b.unit);
    if (delta.used.value === 0n && delta.reserved.value === 0n) continue;
    const scale = Math.max(delta.used.scale, delta.reserved.scale);
    const u = delta.used.value * 10n ** BigInt(scale - delta.used.scale),
      r = delta.reserved.value * 10n ** BigInt(scale - delta.reserved.scale);
    await sql.execute(Prisma.sql`INSERT INTO metering_budget_usage(namespace,budget_id,epoch,settled_value,outstanding_value,scale)
      VALUES(${after.scope.namespace},${b.id},${epoch.epoch},${u.toString()}::numeric,${r.toString()}::numeric,${scale})
      ON CONFLICT(namespace,budget_id,epoch) DO UPDATE SET
        settled_value=metering_budget_usage.settled_value*power(10::numeric,GREATEST(metering_budget_usage.scale,EXCLUDED.scale)-metering_budget_usage.scale)
          +EXCLUDED.settled_value*power(10::numeric,GREATEST(metering_budget_usage.scale,EXCLUDED.scale)-EXCLUDED.scale),
        outstanding_value=metering_budget_usage.outstanding_value*power(10::numeric,GREATEST(metering_budget_usage.scale,EXCLUDED.scale)-metering_budget_usage.scale)
          +EXCLUDED.outstanding_value*power(10::numeric,GREATEST(metering_budget_usage.scale,EXCLUDED.scale)-EXCLUDED.scale),
        scale=GREATEST(metering_budget_usage.scale,EXCLUDED.scale)`);
  }
}
export async function saveBudget(sql: Sql, budget: Budget, fixture = false) {
  await lockScopes(sql, [budget.scope]);
  await lock(sql, `metering:budget:${canonical([budget.scope.namespace, budget.id])}`);
  const [current] = await sql.query<{ version: number }>(
    Prisma.sql`SELECT version FROM metering_budget WHERE namespace=${budget.scope.namespace} AND budget_id=${budget.id} ORDER BY version DESC LIMIT 1`,
  );
  if (!fixture && budget.version !== (current?.version ?? 0) + 1)
    return { outcome: "conflict" as const, reason: "budget_version" as const };
  const conflict = fixture
    ? Prisma.sql`ON CONFLICT(namespace,budget_id,version) DO UPDATE SET body=EXCLUDED.body,scope_kind=EXCLUDED.scope_kind,scope_key=EXCLUDED.scope_key,surface=EXCLUDED.surface,unit=EXCLUDED.unit,limit_value=EXCLUDED.limit_value,limit_scale=EXCLUDED.limit_scale,"window"=EXCLUDED."window",on_exceed=EXCLUDED.on_exceed`
    : Prisma.empty;
  await sql.execute(Prisma.sql`INSERT INTO metering_budget(namespace,budget_id,version,scope_kind,scope_key,surface,unit,limit_value,limit_scale,"window",on_exceed,body)
    VALUES(${budget.scope.namespace},${budget.id},${budget.version},${budget.scope.kind},${canonical(budget.scope)},${budget.surface},${budget.unit},
      ${budget.limit?.value.toString() ?? null}::numeric,${budget.limit?.scale ?? null},${encode(budget.window)}::jsonb,${budget.onExceed},${encode(budget)}::jsonb) ${conflict}`);
  return { outcome: "saved" as const, budget };
}
