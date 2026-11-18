import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { projectBudgetId } from "@/lib/metering/project-funding-budgets";
import { readSpendingBudgets } from "@/lib/metering/spending-limit-store";
import { usage } from "@/lib/metering/store/budgets";
import { plus } from "@/lib/metering/store/codec";
import { createSql } from "@/lib/metering/store/host-sql";
import { resolveWindow } from "@usagekit/core";
import { columnCatalogRequest } from "./catalog-request";
import { modelFundingEstimate } from "./funding-extension";
import type { ModelPlaygroundQuote } from "./launch-service";
import { ModelAdmissionRefusal } from "./payment";
import { unavailableModelValuation } from "./preview";
import type { ModelPlaygroundAccess, ModelPlaygroundRuntime } from "./runtime-contract";
import { createModelPlaygroundRunSchema, modelPlaygroundDraftSchema } from "./schema";
import { modelOwnKeyValuation } from "./valuation-extension";

export type ModelPlaygroundEstimateForecast = ModelPlaygroundQuote["forecasts"][number];
export type ModelPlaygroundEstimateResult = {
  estimatedAt: string;
  /** Yes/no only: whether the project spending budget would still admit a run right now. */
  budgetAvailable: boolean;
  forecasts: ModelPlaygroundEstimateForecast[];
};

/**
 * Reads the project spending budget in a READ ONLY transaction, without scope locks, and
 * reduces it to yes/no. No amount, limit or usage figure leaves this function. A missing
 * budget is "no", as a binding preview would refuse with budget_unavailable.
 */
async function readBudgetAvailable(
  runtime: ModelPlaygroundRuntime,
  access: ModelPlaygroundAccess,
  now: Date,
): Promise<boolean> {
  return runtime.db.$transaction(
    async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
      const budgets = await readSpendingBudgets(
        tx,
        access.namespace,
        [{ kind: "group", namespace: access.namespace, group: access.projectId }],
        "read",
      );
      const budget = budgets.find((b) => b.id === projectBudgetId(access.projectId));
      if (!budget) return false;
      const cap = budget.onExceed === "block" ? budget.limit : (budget.hardLimit ?? null);
      if (!cap) return true;
      const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
      const current = await usage(sql, budget, resolveWindow(budget.window, now).epoch);
      const total = plus(current.used, current.reserved);
      return plus(cap, { ...total, value: -total.value }).value > 0n;
    },
    { isolationLevel: "RepeatableRead" },
  );
}

/**
 * Read-scope estimate. It is computed in memory and is never binding: no quote, preview,
 * attempt, budget lock or other row is written, and no transaction that writes is opened.
 * The catalog comes from the cache only; a cache miss reports the column cost as unknown
 * instead of calling the provider. Budget state is read without a lock and reported only as
 * yes/no, never as an amount.
 */
export async function estimateModelPlayground(
  runtime: ModelPlaygroundRuntime,
  value: unknown,
): Promise<ModelPlaygroundEstimateResult> {
  const access = await runtime.authorize("read");
  const parsed = modelPlaygroundDraftSchema.safeParse(value);
  if (!parsed.success) throw new ModelAdmissionRefusal("configuration_changed");
  const input = parsed.data;
  const now = runtime.now?.() ?? new Date();
  const forecasts: ModelPlaygroundEstimateForecast[] = [];
  for (const column of input.columns) {
    const platform = column.payment.fundingSource === "platform";
    if (
      column.payment.optionId !== (platform ? column.connectionId : `byok:${column.connectionId}`)
    )
      throw new ModelAdmissionRefusal("configuration_changed");
    const catalog = runtime.peekCatalog
      ? await runtime.peekCatalog(runtime.db, access.projectId, columnCatalogRequest(column))
      : null;
    let money = unavailableModelValuation(column)
      .forecast as ModelPlaygroundEstimateForecast["money"];
    if (catalog) {
      const selected = createModelPlaygroundRunSchema([catalog], now).safeParse({
        ...input,
        columns: [column],
      });
      if (!selected.success || !catalog.models.some((m) => m.modelId === column.modelId))
        throw new ModelAdmissionRefusal("catalog_changed");
      money = platform
        ? await runtime.db.$transaction(async (tx) => {
            await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
            return modelFundingEstimate(tx, column, input);
          })
        : (
            runtime.valuation?.(column, input) ??
            modelOwnKeyValuation(column, input) ??
            unavailableModelValuation(column)
          ).forecast;
    }
    forecasts.push({
      columnId: column.columnId,
      money,
      complete: money.certainty !== "unknown",
    });
  }
  const budgetAvailable = await readBudgetAvailable(runtime, access, now);
  return { estimatedAt: now.toISOString(), budgetAvailable, forecasts };
}
