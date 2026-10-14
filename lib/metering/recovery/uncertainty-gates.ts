import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
export async function readUncertaintyGates(tx: Prisma.TransactionClient, namespace: string) {
  const rows = await tx.$queryRaw<
    { kind: string; project: string | null; connection: string | null }[]
  >`
    SELECT b.scope_kind AS kind,b.body->'scope'->>'group' AS project,
      b.body->'scope'->>'connection' AS connection
    FROM metering_budget b WHERE b.namespace=${namespace} AND b.budget_id LIKE 'unresolved:%'
      AND b.limit_value IS NOT NULL AND b.on_exceed='block'
      AND NOT EXISTS(SELECT 1 FROM metering_budget newer WHERE newer.namespace=b.namespace
        AND newer.budget_id=b.budget_id AND newer.version>b.version)`;
  return {
    projects: new Set(
      rows.filter((row) => row.kind === "group" && row.project).map((row) => row.project),
    ),
    connections: new Set(
      rows
        .filter((row) => row.kind === "connection" && row.connection)
        .map((row) => row.connection),
    ),
  };
}
