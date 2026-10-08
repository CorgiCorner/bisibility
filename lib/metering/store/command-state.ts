import type { Budget, Operation, OperationCommand, ReserveInput } from "@usagekit/core";
import { resolveWindow } from "@usagekit/core";
import type { Clock } from "@usagekit/store";
import type { State } from "@usagekit/store/reference";
import {
  currentBudgets,
  difference,
  historicalBudget,
  lockScopes,
  matchingScopes,
  updateUsage,
  usage,
} from "./budgets";
import { canonical, decode, encode, hash, identity, key, plus } from "./codec";
import { appendReceipt, event, hydrate, insert, operationRow, update } from "./records";
import { lock, Prisma, type Sql } from "./sql";

export const newState = (clock: Clock): State => ({
  clock,
  budgets: [],
  operations: new Map(),
  identities: new Map(),
  commands: new Map(),
  leaseKinds: new Map(),
  warnings: new Map(),
  reserveAlerts: new Map(),
  alerts: new Set(),
  requestCommands: new Map(),
  cursors: new Map(),
});
export async function load(sql: Sql, state: State, namespace: string, id: string) {
  const row = await operationRow(sql, namespace, id);
  if (!row) return;
  const op = await hydrate(sql, row),
    k = key(namespace, id);
  state.operations.set(k, op);
  state.identities.set(k, identity(decode<ReserveInput>(row.input)));
  state.warnings.set(k, decode(row.warnings));
  state.reserveAlerts.set(k, decode(row.alerts));
  if (op.lease && row.lease_kind) state.leaseKinds.set(op.lease.leaseId, row.lease_kind);
}
export async function loadReplay(sql: Sql, state: State, input: OperationCommand) {
  const [row] = await sql.query<{ input_hash: string; result: unknown; kind: string }>(Prisma.sql`
    SELECT input_hash,result,kind FROM metering_command WHERE operation_pk=${key(input.namespace, input.operationId)} AND command_id=${input.commandId}`);
  if (row)
    state.commands.set(canonical([input.namespace, input.operationId, input.commandId]), {
      identity:
        hash(canonical({ kind: row.kind, input })) === row.input_hash
          ? canonical({ kind: row.kind, input })
          : "semantic_conflict",
      result: decode(row.result),
    });
}
export async function loadExpired(sql: Sql, state: State, namespace: string, limit: number) {
  const due = await sql.query<{
    operation_id: string;
  }>(Prisma.sql`SELECT operation_id FROM metering_operation
    WHERE namespace=${namespace} AND state='reserved' AND reservation_expires_at<=${state.clock.now()}
    ORDER BY reservation_expires_at,operation_id LIMIT ${limit + 1}`);
  let skipped = false;
  for (const row of due.slice(0, limit)) {
    const pk = key(namespace, row.operation_id);
    if (state.operations.has(pk)) continue;
    if (await lock(sql, `metering:operation:${pk}`, true))
      await load(sql, state, namespace, row.operation_id);
    else skipped = true;
  }
  return skipped || due.length > limit;
}
export async function lockAccounting(sql: Sql, state: State, input?: ReserveInput) {
  if (input) {
    const scopes = matchingScopes(input);
    await lockScopes(sql, scopes);
    state.budgets = await currentBudgets(
      sql,
      input.scope.namespace,
      scopes,
      input.surface,
      input.source,
    );
  }
  const ids = new Set(state.budgets.map((b) => canonical([b.scope.namespace, b.id])));
  for (const op of state.operations.values())
    for (const e of op.budgetEpochs) ids.add(canonical([op.scope.namespace, e.budgetId]));
  for (const id of [...ids].sort()) await lock(sql, `metering:budget:${id}`);
  for (const op of state.operations.values())
    for (const epoch of op.budgetEpochs)
      if (
        !state.budgets.some(
          (b) =>
            b.scope.namespace === op.scope.namespace &&
            b.id === epoch.budgetId &&
            b.version === epoch.budgetVersion,
        )
      )
        state.budgets.push(
          await historicalBudget(sql, op.scope.namespace, epoch.budgetId, epoch.budgetVersion),
        );
}
export async function projectUsage(sql: Sql, state: State, before: Map<string, Operation>) {
  const counters = new Map<string, Awaited<ReturnType<typeof usage>>>();
  for (const budget of state.budgets) {
    const epochs = new Set([resolveWindow(budget.window, state.clock.now()).epoch]);
    for (const op of state.operations.values())
      if (op.scope.namespace === budget.scope.namespace)
        for (const epoch of op.budgetEpochs)
          if (epoch.budgetId === budget.id && epoch.budgetVersion === budget.version)
            epochs.add(epoch.epoch);
    for (const epoch of epochs) {
      counters.set(
        canonical([budget.scope.namespace, budget.id, epoch]),
        await usage(sql, budget, epoch),
      );
      if (budget.alerts?.length) {
        const alerts = await sql.query<{
          alert_key: string;
        }>(Prisma.sql`SELECT alert_key FROM metering_alert
          WHERE namespace=${budget.scope.namespace} AND budget_id=${budget.id} AND epoch=${epoch}`);
        for (const alert of alerts) state.alerts.add(alert.alert_key);
      }
    }
  }
  state.readBudgetUsage = (budget: Budget, epoch: string) => {
    const baseline = counters.get(canonical([budget.scope.namespace, budget.id, epoch]));
    if (!baseline) throw new Error("Missing locked budget projection");
    let used = baseline.used,
      reserved = baseline.reserved;
    for (const [pk, op] of state.operations) {
      if (
        op.scope.namespace !== budget.scope.namespace ||
        !op.budgetEpochs.some((e) => e.budgetId === budget.id && e.epoch === epoch)
      )
        continue;
      const delta = difference(before.get(pk) ?? null, op, budget.unit);
      used = plus(used, delta.used);
      reserved = plus(reserved, delta.reserved);
    }
    return { used, reserved };
  };
}
export async function persist(
  sql: Sql,
  before: State,
  state: State,
  afterOperationWrite?: () => void,
) {
  const changed: Operation[] = [];
  for (const [pk, op] of state.operations) {
    const old = before.operations.get(pk);
    if (old && canonical(old) === canonical(op)) continue;
    if (!old)
      await insert(sql, op, state.warnings.get(pk) ?? [], state.reserveAlerts.get(pk) ?? []);
    else if (
      !(await update(
        sql,
        old,
        op,
        op.lease ? (state.leaseKinds.get(op.lease.leaseId) ?? null) : null,
      ))
    )
      throw new VersionConflict();
    afterOperationWrite?.();
    for (let n = old?.receipts.length ?? 0; n < op.receipts.length; n++) {
      const receipt = op.receipts[n];
      if (!receipt) throw new Error("Missing appended receipt");
      await appendReceipt(sql, op, receipt, n);
    }
    await updateUsage(sql, old ?? null, op);
    if (!old || old.version !== op.version) changed.push(op);
  }
  for (const [commandKey, entry] of state.commands) {
    if (before.commands.has(commandKey)) continue;
    const [namespace, id, commandId] = JSON.parse(commandKey) as string[];
    if (!namespace || !id || !commandId) throw new Error("Invalid stored command identity");
    const identityBody = JSON.parse(entry.identity) as { kind: string; input: unknown };
    // Canonical identities encode bigint as strings. The stored identity remains exact for replay.
    await sql.execute(Prisma.sql`INSERT INTO metering_command(operation_pk,command_id,kind,input_hash,input,result)
      VALUES(${key(namespace, id)},${commandId},${identityBody.kind},${hash(entry.identity)},${encode(identityBody.input)}::jsonb,${encode(entry.result)}::jsonb)`);
  }
  for (const op of changed) await event(sql, op);
  for (const value of state.alerts) {
    if (before.alerts.has(value)) continue;
    const [namespace, budgetId, epoch, threshold] = JSON.parse(value) as string[];
    await sql.execute(Prisma.sql`INSERT INTO metering_alert(alert_key,namespace,budget_id,epoch,threshold)
      VALUES(${value},${namespace},${budgetId},${epoch},${threshold})`);
  }
}
export class VersionConflict extends Error {}
