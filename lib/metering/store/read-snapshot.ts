import { AsyncLocalStorage } from "node:async_hooks";
import type { ApplicableBudgetsQuery, BudgetStatus } from "@usagekit/core";
import type { PostgresDriver, PostgresExecutor } from "@usagekit/store-postgres";

type BudgetStatusReader = (query: ApplicableBudgetsQuery) => Promise<readonly BudgetStatus[]>;
const current = new AsyncLocalStorage<{
  executor: PostgresExecutor;
  readApplicableBudgets?: BudgetStatusReader;
}>();

/** Cache only budget facts inside one database snapshot, never across requests or writes. */
export function withBudgetReadExecutor<T>(
  executor: PostgresExecutor,
  body: () => Promise<T>,
  readApplicableBudgets?: BudgetStatusReader,
) {
  const reads = new Map<string, Promise<unknown[]>>();
  const cached: PostgresExecutor = {
    query: async <R>(query: Parameters<PostgresExecutor["query"]>[0]): Promise<R[]> => {
      if (
        !/^\s*SELECT\b/i.test(query.text) ||
        !/\bFROM\s+metering_budget(?:_usage)?\b/i.test(query.text)
      )
        return executor.query<R>(query);
      const key = JSON.stringify(query, (_key, value) =>
        typeof value === "bigint" ? { bigint: value.toString() } : value,
      );
      let pending = reads.get(key);
      if (!pending) {
        pending = executor.query(query);
        reads.set(key, pending);
      }
      return structuredClone(await pending) as R[];
    },
    execute: async () => {
      throw new Error("Budget snapshots cannot execute writes");
    },
  };
  return current.run({ executor: cached, readApplicableBudgets }, body);
}

export function budgetSnapshotStatusReader(fallback: BudgetStatusReader): BudgetStatusReader {
  return (query) => (current.getStore()?.readApplicableBudgets ?? fallback)(query);
}

/** The normal driver remains authoritative for every request outside the explicit snapshot. */
export function budgetSnapshotDriver(driver: PostgresDriver): PostgresDriver {
  return {
    transaction(readOnly, body) {
      const snapshot = current.getStore();
      if (!snapshot) return driver.transaction(readOnly, body);
      if (!readOnly) throw new Error("Budget snapshots cannot start write transactions");
      return body(snapshot.executor);
    },
  };
}
