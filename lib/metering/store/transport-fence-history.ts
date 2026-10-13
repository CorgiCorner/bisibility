import { createHash } from "node:crypto";
import { projectTransportFence } from "@/lib/metering/transport-fence";
import type { PostgresExecutor } from "@usagekit/store-postgres";
import { canonical } from "./codec";

type Row = {
  namespace: string;
  operation_id: string;
  principal: string;
  context: unknown;
  dispatch_lease_id: string | null;
  physical: string | null;
  fenced_at_iso: string | null;
  input: unknown;
  grant: unknown;
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid transport fence identity evidence");
  return value as Record<string, unknown>;
};
function scopeMatches(
  scope: Record<string, unknown>,
  row: Row,
  inputScope: Record<string, unknown>,
) {
  return (
    scope.namespace === row.namespace &&
    scope.principal === row.principal &&
    scope.connection === inputScope.connection &&
    scope.group === inputScope.group &&
    scope.providerCredentialVersion === inputScope.providerCredentialVersion
  );
}
export function verifyTransportFenceRow(row: Row) {
  if (!row.physical || !row.dispatch_lease_id)
    throw new Error("Incomplete transport fence identity evidence");
  const input = object(row.input),
    scope = object(input.scope),
    context = object(row.context);
  if (
    ![
      context.projectId,
      context.connectionId,
      context.providerCredentialVersion,
      input.provider,
    ].every((value) => typeof value === "string" && value.length > 0)
  )
    throw new Error("Incomplete transport fence provider context");
  const grant = object(row.grant),
    operation = object(grant.operation),
    lease = object(grant.lease);
  if (
    !scopeMatches(scope, row, scope) ||
    context.projectId !== scope.group ||
    context.connectionId !== scope.connection ||
    context.providerCredentialVersion !== scope.providerCredentialVersion ||
    (context.requestPricing != null &&
      object(context.requestPricing).provider !== input.provider) ||
    grant.granted !== true ||
    lease.leaseId !== row.dispatch_lease_id ||
    operation.operationId !== row.operation_id ||
    operation.provider !== input.provider ||
    operation.fundingSource !== input.fundingSource ||
    operation.costOwner !== input.costOwner ||
    operation.operation !== input.operation ||
    operation.surface !== input.surface ||
    operation.source !== input.source ||
    canonical(operation.scope) !== canonical(scope) ||
    !scopeMatches(object(operation.scope), row, scope) ||
    object(operation.lease).leaseId !== row.dispatch_lease_id
  )
    throw new Error("Transport fence does not match its original paid grant");
  return projectTransportFence({
    transportFenced: true,
    fenced_at_iso: row.fenced_at_iso,
    transportFenceEpochMs: row.physical,
  }).transportFenceProvenance;
}

/** Legacy physical values are fingerprinted unchanged, never certified as original instants. */
export async function auditTransportFences(executor: PostgresExecutor) {
  let namespace = "",
    operationId = "",
    legacyUnknown = 0,
    verifiedIso = 0;
  const fingerprint = createHash("sha256");
  for (;;) {
    const rows = await executor.query<Row>({
      text: `
      SELECT a.namespace,a.operation_id,a.principal,a.context,a.dispatch_lease_id,a.fenced_at_iso,
        (extract(epoch FROM a.fenced_at)*1000)::text AS physical,o.input,c.result AS grant
      FROM metering_paid_attempt_context a
      LEFT JOIN metering_operation o USING(namespace,operation_id)
      LEFT JOIN metering_command c ON c.operation_pk=o.operation_pk AND c.command_id='paid:first-intent'
      WHERE (a.fenced_at IS NOT NULL OR a.fenced_at_iso IS NOT NULL)
        AND (a.namespace,a.operation_id)>($1,$2)
      ORDER BY a.namespace,a.operation_id LIMIT 1000`,
      values: [namespace, operationId],
    });
    for (const row of rows) {
      const provenance = verifyTransportFenceRow(row);
      if (provenance === "legacy_unknown") legacyUnknown += 1;
      else verifiedIso += 1;
      fingerprint.update(
        JSON.stringify([
          row.namespace,
          row.operation_id,
          row.principal,
          row.dispatch_lease_id,
          row.physical,
          row.fenced_at_iso,
          provenance,
        ]) + "\n",
      );
    }
    if (rows.length < 1000) break;
    namespace = rows[rows.length - 1].namespace;
    operationId = rows[rows.length - 1].operation_id;
  }
  return {
    version: 1,
    legacyFenceInstant: "unknown",
    legacyUnknown,
    verifiedIso,
    physicalIdentitySha256: fingerprint.digest("hex"),
  };
}
