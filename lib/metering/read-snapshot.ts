import "server-only";
import { databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { prisma } from "@/lib/db/prisma";
import type { ApplicableBudgetsQuery, BudgetStatus } from "@usagekit/core";
import { prismaPostgresExecutor } from "@usagekit/store-postgres";
import { readProjectBudgetStatuses } from "./project-budget-statuses";
import { currentBudgets, matchingScopes, status } from "./store/budgets";
import { canonical } from "./store/codec";
import { createSql, type Sql } from "./store/host-sql";
import { exactNumericExecutor } from "./store/numeric";
import { withBudgetReadExecutor } from "./store/read-snapshot";
import { requireTimestampContract } from "./store/timestamp-history";
import { setLocalUtc } from "./store/timestamp-policy";

/** Load each surface once; Meter still checks authority separately for every requested source. */
export function projectSnapshotStatusReader(sql: Sql, now: Date) {
  const scopesBySurface = new Map<string, ReturnType<typeof currentBudgets>>();
  const statuses = new Map<string, Promise<BudgetStatus>>();
  return async (query: ApplicableBudgetsQuery): Promise<readonly BudgetStatus[]> => {
    const scopes = matchingScopes(query);
    const key = canonical([scopes, query.surface]);
    let definitions = scopesBySurface.get(key);
    if (!definitions) {
      definitions = currentBudgets(sql, query.scope.namespace, scopes, query.surface);
      scopesBySurface.set(key, definitions);
    }
    return Promise.all(
      (await definitions)
        .filter(
          (budget) =>
            query.source === undefined ||
            ["any", query.surface, query.source].includes(budget.surface),
        )
        .map((budget) => {
          const id = canonical([budget.scope.namespace, budget.id, budget.version]);
          let pending = statuses.get(id);
          if (!pending) {
            pending = status(sql, budget, now);
            statuses.set(id, pending);
          }
          return pending;
        }),
    );
  };
}

/** One connection and one consistent set of facts for a page's many source-specific budgets. */
function withMeteringBudgetSnapshot<T>(body: () => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const schema = databaseSchemaFromUrl(process.env.DATABASE_URL ?? "") ?? "public";
      await tx.$queryRaw`SELECT set_config('search_path',${`"${schema.replaceAll('"', '""')}"`},true)`;
      const executor = exactNumericExecutor(prismaPostgresExecutor(tx));
      await setLocalUtc(executor);
      await requireTimestampContract(executor);
      const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
      return withBudgetReadExecutor(executor, body, projectSnapshotStatusReader(sql, new Date()));
    },
    { isolationLevel: "RepeatableRead", maxWait: 15_000, timeout: 15_000 },
  );
}

export function readProjectBudgetSnapshot(...args: Parameters<typeof readProjectBudgetStatuses>) {
  return withMeteringBudgetSnapshot(() => readProjectBudgetStatuses(...args));
}
