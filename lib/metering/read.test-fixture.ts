import { PGlite } from "@electric-sql/pglite";
import type { Budget } from "@usagekit/core";
import { canonical, encode } from "./store/codec";
import { createUsageTables } from "./usage.test-fixture";

/** Executes the readers' actual SQL against physical Store fixtures. */
export async function usageReadFixture() {
  const db = new PGlite();
  await createUsageTables(db);
  await db.exec(`CREATE TABLE metering_budget(namespace text,budget_id text,version int,scope_key text,surface text,sequence serial,body jsonb);
    CREATE TABLE metering_budget_usage(namespace text,budget_id text,epoch text,settled_value numeric,outstanding_value numeric,scale int);`);
  return {
    db,
    query: async (query: { text: string; values: unknown[] }) =>
      (await db.query(query.text, query.values)).rows,
    async budget(budget: Budget, used = 0, reserved = 0) {
      await db.query(
        `INSERT INTO metering_budget(namespace,budget_id,version,scope_key,surface,body) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          budget.scope.namespace,
          budget.id,
          budget.version,
          canonical(budget.scope),
          budget.surface,
          encode(budget),
        ],
      );
      const { resolveWindow } = await import("@usagekit/core");
      await db.query(`INSERT INTO metering_budget_usage VALUES($1,$2,$3,$4,$5,0)`, [
        budget.scope.namespace,
        budget.id,
        resolveWindow(budget.window, new Date()).epoch,
        used,
        reserved,
      ]);
    },
  };
}
export function projectTestBudget(limit = 100): Budget {
  return {
    id: "project:project_1:monthly",
    version: 1,
    scope: { kind: "group", namespace: "default", group: "project_1" },
    surface: "any",
    unit: "budget_cents",
    limit: { value: BigInt(limit), scale: 0, unit: "budget_cents" },
    window: { kind: "calendar_month", timezone: "UTC" },
    onExceed: "block",
  };
}
