import type { DataMigrationDatabase } from "../data-migrations/types";

/** Run before schema retirement: another namespace cannot contribute to active budgets. */
export async function assertAccountingCutoverNamespace(db: DataMigrationDatabase, namespace: string) {
  const legacy = await db.query("SELECT to_regclass('provider_cost_entries') IS NOT NULL AS present");
  if (!legacy.rows[0]?.present) return;
  const sources = [
    ["metering_usage_evidence", "namespace"],
    ["metering_operation", "namespace"],
  ] as const;
  for (const [table, expression] of sources) {
    const exists = await db.query("SELECT to_regclass($1) IS NOT NULL AS present", [table]);
    if (!exists.rows[0]?.present) continue;
    const different = await db.query(`SELECT 1 FROM ${table} WHERE ${expression} IS NOT NULL AND ${expression} <> $1 LIMIT 1`, [namespace]);
    if (different.rows.length) throw new Error("Retained accounting namespace differs from METERING_NAMESPACE; reconcile the deployment configuration before schema migration.");
  }
  const tables = await db.query("SELECT to_regclass('provider_cost_entries') IS NOT NULL AND to_regclass('metering_operation') IS NOT NULL AS present");
  if (!tables.rows[0]?.present) return;
  const unresolved = await db.query(`SELECT 1 FROM metering_operation o
    JOIN provider_cost_entries p ON o.operation_id IN (p.id, 'legacy:' || p.id, 'hosted-attempt:' || p.id)
    WHERE o.namespace=$1 AND (o.state NOT IN ('pending','settled','released') OR o.lease_id IS NOT NULL
      OR NOT EXISTS(SELECT 1 FROM metering_receipt r WHERE r.operation_pk=o.operation_pk)) LIMIT 1`, [namespace]);
  if (unresolved.rows.length) throw new Error("Canonical accounting history requires reconciliation before schema migration.");
}
