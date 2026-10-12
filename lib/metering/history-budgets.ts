import { providerAllocationMetadata } from "@/lib/providers/allocation-metadata";
import type { Budget } from "@usagekit/core";
import { fundingBudgetId, fundingSpendingBudgets, projectSpendingBudget } from "./spending-limits";
import { currentBudgets, saveBudget } from "./store/budgets";
import { canonical, decode } from "./store/codec";
import { Prisma, type Sql } from "./store/sql";

type Setting = { kind: string; payload: unknown };
type Connection = {
  id: string;
  projectId: string;
  provider: string;
  allocationUnit: "cents" | "units" | null;
  allocationAmountPerMonth: string | null;
  programmaticAllocationAmountPerMonth: string | null;
  creditsAllocationAmountPerMonth: string | null;
  creditsProgrammaticAllocationAmountPerMonth: string | null;
};
export async function historyBudgets(sql: Sql, namespace: string, persist: boolean) {
  const settings = await sql.query<Setting>(
    Prisma.sql`SELECT kind,payload FROM metering_legacy_setting_source WHERE kind IN ('project','connection') ORDER BY kind,source_id`,
  );
  const existing = await currentBudgets(sql, namespace);
  const expected: Budget[] = [];
  for (const row of settings) {
    if (row.kind === "project") {
      const p = decode<{ id: string; budgetCapCents: string | null }>(row.payload);
      expected.push(projectSpendingBudget(namespace, p.id, p.budgetCapCents, 1));
    } else {
      const c = decode<Connection>(row.payload);
      const metadata = providerAllocationMetadata(c.provider);
      if (metadata?.kind === "non_billable") continue;
      const unit =
        c.allocationUnit ?? (metadata?.kind === "billable" ? metadata.allocationUnit : null);
      if (
        !unit &&
        (c.allocationAmountPerMonth !== null || c.programmaticAllocationAmountPerMonth !== null)
      )
        throw new Error("Historical native budget unit is unavailable");
      for (const funding of ["byok", "platform"] as const) {
        if (funding === "byok" && !unit) continue;
        expected.push(
          ...fundingSpendingBudgets(
            namespace,
            {
              id: c.id,
              provider: c.provider,
              unit: unit ?? "cents",
              app:
                funding === "byok" ? c.allocationAmountPerMonth : c.creditsAllocationAmountPerMonth,
              programmatic:
                funding === "byok"
                  ? c.programmaticAllocationAmountPerMonth
                  : c.creditsProgrammaticAllocationAmountPerMonth,
            },
            funding,
            1,
          ),
        );
      }
    }
  }
  for (const budget of expected) {
    const stored = existing.find((b) => b.id === budget.id);
    const changed = stored && canonical({ ...stored, version: 1 }) !== canonical(budget);
    const legacyConnection = stored?.scope.kind === "connection" ? stored.scope.connection : null;
    const legacyScope =
      legacyConnection !== null
        ? (["byok", "platform"] as const).some(
            (funding) => fundingBudgetId(legacyConnection, funding, budget.surface) === budget.id,
          )
        : stored && canonical(stored.scope) === canonical(budget.scope);
    const upgradeable =
      stored &&
      legacyScope &&
      canonical({
        ...stored,
        version: 1,
        scope: budget.scope,
        onExceed: budget.onExceed,
      }) === canonical(budget);
    if (changed && (!persist || !upgradeable))
      throw new Error("Historical budget settings conflict");
    if ((!stored || changed) && persist) {
      // The immutable snapshot supplies the cutover policy. Retain old epochs and
      // their versions while promoting shadow/legacy scopes to active enforcement.
      const next = { ...budget, version: (stored?.version ?? 0) + 1 };
      if ((await saveBudget(sql, next)).outcome !== "saved")
        throw new Error("Historical budget version conflict");
    } else if (!stored) throw new Error("Historical budget setting missing");
  }
  return expected;
}
