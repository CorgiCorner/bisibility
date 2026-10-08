import type { BillingImportInput } from "@usagekit/core";
import type { State } from "@usagekit/store/reference";
import { key } from "./codec";
import { load } from "./command-state";
import { lock, Prisma, type Sql } from "./sql";

/** The connection accounting gate prevents request/receipt phantoms during this snapshot. */
export async function loadBillingCandidates(sql: Sql, state: State, input: BillingImportInput) {
  const ids = input.lines.flatMap((line) =>
    line.providerRequestId === undefined ? [] : [line.providerRequestId],
  );
  const requestMatch = ids.length
    ? Prisma.sql`OR EXISTS(SELECT 1 FROM metering_receipt r WHERE r.operation_pk=o.operation_pk
        AND r.body->>'providerRequestId' IN (${Prisma.join(ids)}))`
    : Prisma.empty;
  const rows = await sql.query<{ operation_id: string }>(Prisma.sql`
    SELECT o.operation_id FROM metering_operation o
    WHERE o.namespace=${input.scope.namespace} AND o.principal=${input.scope.principal}
      AND o.input->'scope'->>'connection'=${input.scope.connection} AND o.input->>'provider'=${input.provider}
      AND ((o.created_at>=${new Date(input.window.from)} AND o.created_at<${new Date(input.window.to)})
        OR EXISTS(SELECT 1 FROM metering_receipt r WHERE r.operation_pk=o.operation_pk
          AND r.occurred_at>=${new Date(input.window.from)} AND r.occurred_at<${new Date(input.window.to)})
        ${requestMatch}) ORDER BY o.operation_pk`);
  for (const row of rows) {
    await lock(sql, `metering:operation:${key(input.scope.namespace, row.operation_id)}`);
    await load(sql, state, input.scope.namespace, row.operation_id);
  }
}
