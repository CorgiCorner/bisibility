import type { Operation, OperationCommand, OperationRef } from "@usagekit/core";
import type { Clock, Store } from "@usagekit/store";
import { InvalidInput } from "@usagekit/store";
import type { State } from "@usagekit/store/reference";
import * as reference from "@usagekit/store/reference";
import { lockConnectionAccounting, lockOperationAccounting } from "./accounting-lock";
import { key } from "./codec";
import {
  load,
  loadExpired,
  loadReplay,
  lockAccounting,
  newState,
  persist,
  projectUsage,
  VersionConflict,
} from "./command-state";
import { lock, Prisma, type Sql, type transactions } from "./sql";

type Transactions = ReturnType<typeof transactions>;
const snapshot = (s: State): State => ({
  ...s,
  operations: structuredClone(s.operations),
  commands: structuredClone(s.commands),
  reserveAlerts: structuredClone(s.reserveAlerts),
  alerts: new Set(s.alerts),
});
type CommandStore = Pick<
  Store,
  | "reserve"
  | "expireReservations"
  | "markDispatchIntent"
  | "renewLease"
  | "claimForRecovery"
  | "settle"
  | "correct"
  | "releaseUndispatched"
>;
export function commands(tx: Transactions, clock: Clock, hook?: () => void): CommandStore {
  const execute = async <T>(sql: Sql, s: State, before: State, run: () => T) => {
    const result = run();
    await persist(sql, before, s, hook);
    return result;
  };
  const command = async <T>(
    input: OperationRef,
    run: (s: State) => T,
    conflict: (op: Operation | null) => T,
  ): Promise<T> => {
    try {
      return await tx.write(async (sql) => {
        await lockOperationAccounting(sql, input);
        await lock(sql, `metering:operation:${key(input.namespace, input.operationId)}`);
        const s = newState(clock);
        await load(sql, s, input.namespace, input.operationId);
        if ("commandId" in input) await loadReplay(sql, s, input as OperationCommand);
        await lockAccounting(sql, s);
        await projectUsage(sql, s, snapshot(s).operations);
        return execute(sql, s, snapshot(s), () => run(s));
      });
    } catch (error) {
      if (!(error instanceof VersionConflict)) throw error;
      // The advisory lock normally prevents this. Preserve typed CAS refusal if another writer ignores it.
      return tx.read(async (sql) => {
        const s = newState(clock);
        await load(sql, s, input.namespace, input.operationId);
        const operation = reference.find(s, input);
        return conflict(operation);
      });
    }
  };
  return {
    reserve: (input, policy) =>
      tx.write(async (sql) => {
        await lockConnectionAccounting(sql, input.scope.namespace, input.scope.connection);
        await lock(sql, `metering:operation:${key(input.scope.namespace, input.operationId)}`);
        const s = newState(clock);
        await load(sql, s, input.scope.namespace, input.operationId);
        const counted = await sql.query<{
          identity_hash: string;
        }>(Prisma.sql`SELECT identity_hash FROM metering_request_command
          WHERE namespace=${input.scope.namespace} AND command_id=${input.operationId}`);
        if (counted[0])
          s.requestCommands?.set(
            key(input.scope.namespace, input.operationId),
            counted[0].identity_hash,
          );
        await loadExpired(sql, s, input.scope.namespace, 100);
        await lockAccounting(sql, s, input);
        await projectUsage(sql, s, snapshot(s).operations);
        const before = snapshot(s);
        return execute(sql, s, before, () => reference.reserve(s, input, policy));
      }),
    expireReservations: (input) =>
      tx.write(async (sql) => {
        const limit = input.limit ?? 100;
        if (!input.namespace.trim() || !Number.isInteger(limit) || limit < 1 || limit > 1000)
          throw new InvalidInput("expiration");
        const s = newState(clock),
          more = await loadExpired(sql, s, input.namespace, limit);
        await lockAccounting(sql, s);
        return execute(sql, s, snapshot(s), () => {
          const result = reference.expireReservations(s, input);
          return { ...result, hasMore: result.hasMore || more };
        });
      }),
    markDispatchIntent: (input) =>
      command(
        input,
        (s) => reference.intent(s, input),
        (operation) => ({ granted: false, reason: "version_conflict", operation }),
      ),
    renewLease: (input) =>
      command(
        input,
        (s) => reference.renew(s, input),
        () => ({ outcome: "invalid", field: "version", reason: "version_conflict" }),
      ),
    claimForRecovery: (input) =>
      command(
        input,
        (s) => reference.claim(s, input),
        () => ({ outcome: "invalid", field: "version", reason: "version_conflict" }),
      ),
    settle: (input) =>
      command(
        input,
        (s) => reference.settle(s, input),
        (operation) => ({ outcome: "rejected", reason: "version_conflict", operation }),
      ),
    correct: (input) =>
      command(
        input,
        (s) => reference.settle(s, input, true),
        (operation) => ({ outcome: "rejected", reason: "version_conflict", operation }),
      ),
    releaseUndispatched: (input) =>
      command(
        input,
        (s) => reference.release(s, input),
        (operation) => ({ outcome: "rejected", reason: "version_conflict", operation }),
      ),
  };
}
