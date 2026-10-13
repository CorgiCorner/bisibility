import type { PostgresExecutor } from "@usagekit/store-postgres";
import { auditTransportFences } from "./transport-fence-history";
export const timestampContractKey = "bisibility.utc_timestamp_contract";
const contract = "utc-core-v2-fence-presence-v1";
const guardedTables = [
  "metering_operation",
  "metering_receipt",
  "metering_event",
  "metering_import",
  "metering_paid_attempt_context",
  "metering_history_progress",
];
export class TimestampHistoryError extends Error {
  constructor(reason: string) {
    super(
      `Metering UTC adoption refused: ${reason}. Drain legacy writers and audit every unproven timestamp against independent UTC evidence; historical dates are never repaired automatically.`,
    );
    this.name = "TimestampHistoryError";
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TimestampHistoryError("invalid retained timestamp evidence");
  return value as Record<string, unknown>;
}
function physical(value: string): bigint {
  const match = /^(-?\d+)(?:\.0+)?$/.exec(value);
  if (!match) throw new TimestampHistoryError("unproven sub-millisecond timestamp");
  return BigInt(match[1]);
}
function matches(value: unknown, epoch: string) {
  if (
    typeof value !== "string" ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new TimestampHistoryError("missing or ambiguous retained UTC timestamp");
  return BigInt(Date.parse(value)) === physical(epoch);
}
type OperationEvidence = {
  operation_pk: string;
  namespace: string;
  principal: string;
  operation_id: string;
  version: number;
  created: string;
  updated: string;
  reservation: string;
  lease_id: string | null;
  lease: string | null;
  snapshots: unknown[];
  input: unknown;
  state: string;
  latest_receipt: unknown;
  latest_import: unknown;
  latest_import_id: string | null;
  origin_import: unknown;
  origin_import_id: string | null;
};
function linkedImport(row: OperationEvidence, value: unknown, id: string | null) {
  if (!value || !id) return null;
  const journal = record(value),
    scope = record(journal.scope),
    input = record(row.input),
    operationScope = record(input.scope);
  return journal.id === id &&
    scope.namespace === row.namespace &&
    scope.principal === row.principal &&
    scope.connection === operationScope.connection &&
    journal.provider === input.provider
    ? journal
    : null;
}
function includesId(value: unknown, id: string) {
  return Array.isArray(value) && value.includes(id);
}
function billingDates(row: OperationEvidence) {
  const origin = linkedImport(row, row.origin_import, row.origin_import_id);
  const input = record(row.input);
  const originDate =
    origin &&
    input.source === "import" &&
    /^\d+$/.test(row.operation_id.slice(`${origin.id}:unobserved:`.length)) &&
    row.operation_id.startsWith(`${origin.id}:unobserved:`) &&
    includesId(origin.unobservedOperationIds, row.operation_id)
      ? origin.recordedAt
      : null;
  const latest = linkedImport(row, row.latest_import, row.latest_import_id);
  const receipt = row.latest_receipt ? record(row.latest_receipt) : null;
  const updatedDate =
    latest &&
    receipt?.source === "import" &&
    receipt.evidenceRef === latest.id &&
    typeof receipt.id === "string" &&
    receipt.id.startsWith(`${latest.id}:receipt:`) &&
    (includesId(latest.matchedOperationIds, row.operation_id) ||
      includesId(latest.unobservedOperationIds, row.operation_id)) &&
    ["pending", "settled"].includes(row.state) &&
    !row.lease_id &&
    !row.lease &&
    matches(receipt.recordedAt, row.updated) &&
    matches(latest.recordedAt, row.updated)
      ? latest.recordedAt
      : null;
  return { originDate, updatedDate };
}
/** Every existing row needs evidence. A current session timezone is never historical proof. */
export async function verifyTimestampHistory(executor: PostgresExecutor) {
  let cursor = "";
  for (;;) {
    const rows = await executor.query<OperationEvidence>({
      text: `
      SELECT o.operation_pk,o.namespace,o.principal,o.operation_id,o.version,o.input,o.state,
        r.body AS latest_receipt,i.body AS latest_import,i.import_id AS latest_import_id,
        origin.body AS origin_import,origin.import_id AS origin_import_id,
        (extract(epoch FROM o.created_at)*1000)::text AS created,
        (extract(epoch FROM o.updated_at)*1000)::text AS updated,
        (extract(epoch FROM o.reservation_expires_at)*1000)::text AS reservation,
        o.lease_id,(extract(epoch FROM o.lease_expires_at)*1000)::text AS lease,
        COALESCE((SELECT jsonb_agg(c.result->'operation') FROM metering_command c
          WHERE c.operation_pk=o.operation_pk AND c.result ? 'operation' AND c.result->'operation'<>'null'::jsonb),'[]'::jsonb)
        || COALESCE((SELECT jsonb_agg(h.body->'operation') FROM metering_history_import h
          WHERE h.namespace=o.namespace AND h.operation_id=o.operation_id),'[]'::jsonb) AS snapshots
      FROM metering_operation o
      LEFT JOIN LATERAL (SELECT body FROM metering_receipt WHERE operation_pk=o.operation_pk ORDER BY sequence DESC LIMIT 1) r ON true
      LEFT JOIN metering_import i ON i.import_id=r.body->>'evidenceRef'
      LEFT JOIN metering_import origin ON o.input->>'source'='import'
        AND origin.import_id=regexp_replace(o.operation_id,':unobserved:[0-9]+$','')
      WHERE o.operation_pk>$1 ORDER BY o.operation_pk LIMIT 1000`,
      values: [cursor],
    });
    for (const row of rows) {
      const snapshots = row.snapshots.map(record);
      const billing = billingDates(row);
      if (!snapshots.length && !billing.originDate)
        throw new TimestampHistoryError(
          `operation ${row.operation_pk} has no retained timestamp snapshot`,
        );
      if (
        billing.originDate &&
        (!matches(billing.originDate, row.created) || !matches(billing.originDate, row.reservation))
      )
        throw new TimestampHistoryError(
          `operation ${row.operation_pk} disagrees with its immutable billing creation evidence`,
        );
      for (const snapshot of snapshots) {
        const scope = record(snapshot.scope);
        if (
          snapshot.operationId !== row.operation_id ||
          scope.namespace !== row.namespace ||
          scope.principal !== row.principal ||
          !matches(snapshot.createdAt, row.created) ||
          !matches(snapshot.reservationExpiresAt, row.reservation)
        )
          throw new TimestampHistoryError(
            `operation ${row.operation_pk} disagrees with its immutable timestamp evidence`,
          );
      }
      const current = snapshots.filter((snapshot) => snapshot.version === row.version);
      if (
        !current.some((snapshot) => matches(snapshot.updatedAt, row.updated)) &&
        !billing.updatedDate
      )
        throw new TimestampHistoryError(
          `operation ${row.operation_pk} has no matching current updatedAt evidence`,
        );
      if (
        row.lease_id &&
        (!row.lease ||
          !current.some((snapshot) => {
            const lease = snapshot.lease ? record(snapshot.lease) : null;
            return lease?.leaseId === row.lease_id && matches(lease.expiresAt, row.lease as string);
          }))
      )
        throw new TimestampHistoryError(
          `operation ${row.operation_pk} has no matching current lease evidence`,
        );
      if (!row.lease_id && row.lease)
        throw new TimestampHistoryError("incomplete historical lease");
      if (
        !row.lease_id &&
        !current.some((snapshot) => snapshot.lease === null) &&
        !billing.updatedDate
      )
        throw new TimestampHistoryError(
          `operation ${row.operation_pk} has no matching cleared lease evidence`,
        );
    }
    if (rows.length < 1000) break;
    cursor = rows[rows.length - 1].operation_pk;
  }
  // Compare all receipts/imports/events in SQL, then return only a bounded failure identity.
  const [bad] = await executor.query<{ identity: string }>({
    text: `
    SELECT identity FROM (
      SELECT 'receipt:'||receipt_pk AS identity FROM metering_receipt
        WHERE receipt_id IS DISTINCT FROM body->>'id'
          OR occurred_at IS DISTINCT FROM (body->>'occurredAt')::timestamptz
          OR recorded_at IS DISTINCT FROM (body->>'recordedAt')::timestamptz
          OR (body->>'occurredAt') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
          OR (body->>'recordedAt') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
      UNION ALL SELECT 'import:'||import_id FROM metering_import
        WHERE import_id IS DISTINCT FROM body->>'id'
          OR namespace IS DISTINCT FROM body->'scope'->>'namespace'
          OR principal IS DISTINCT FROM body->'scope'->>'principal'
          OR connection IS DISTINCT FROM body->'scope'->>'connection'
          OR provider IS DISTINCT FROM body->>'provider'
          OR window_from IS DISTINCT FROM (body->'window'->>'from')::timestamptz
          OR window_to IS DISTINCT FROM (body->'window'->>'to')::timestamptz
          OR recorded_at IS DISTINCT FROM (body->>'recordedAt')::timestamptz
          OR (body->'window'->>'from') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
          OR (body->'window'->>'to') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
          OR (body->>'recordedAt') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
      UNION ALL SELECT 'event:'||e.event_id FROM metering_event e LEFT JOIN metering_receipt r USING(receipt_pk)
        WHERE e.occurred_at IS DISTINCT FROM r.occurred_at
    ) failures LIMIT 1`,
    values: [],
  });
  if (bad)
    throw new TimestampHistoryError(
      `${bad.identity} has mismatched or unproven historical timestamp evidence`,
    );
}
async function checkEnforcement(executor: PostgresExecutor) {
  // The six row triggers are the rollout boundary, not the marker alone.
  const [enforcement] = await executor.query<{ tables: string[] }>({
    text: `
    SELECT array_agg(c.relname::text ORDER BY c.relname) AS tables FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE n.nspname=current_schema() AND t.tgname='metering_utc_writer'
        AND p.proname='metering_require_utc_writer' AND p.pronamespace=n.oid
        AND t.tgtype=23 AND t.tgenabled='O' AND NOT t.tgisinternal
        AND EXISTS(SELECT 1 FROM pg_trigger f JOIN pg_class fc ON fc.oid=f.tgrelid
          JOIN pg_namespace fn ON fn.oid=fc.relnamespace JOIN pg_proc fp ON fp.oid=f.tgfoid
          WHERE fn.nspname=current_schema() AND fc.relname='metering_paid_attempt_context'
            AND f.tgname='metering_transport_fence' AND f.tgenabled='O' AND f.tgtype=23
            AND fp.proname='metering_preserve_transport_fence' AND fp.pronamespace=fn.oid)`,
    values: [],
  });
  if (!enforcement?.tables || [...guardedTables].sort().join() !== enforcement.tables.join())
    throw new TimestampHistoryError("UTC writer migration is missing or disabled");
}
const readContract = async (executor: PostgresExecutor) =>
  (
    await executor.query<{ value: string }>({
      text: "SELECT value FROM metering_metadata WHERE key=$1",
      values: [timestampContractKey],
    })
  )[0]?.value;
/** Read-only callers can verify an adopted ledger, but never bootstrap one. */
export async function requireTimestampContract(executor: PostgresExecutor) {
  await checkEnforcement(executor);
  if ((await readContract(executor)) !== contract)
    throw new TimestampHistoryError("read path requires prior UTC write adoption");
}
export async function ensureTimestampContract(executor: PostgresExecutor) {
  await checkEnforcement(executor);
  const existing = await readContract(executor);
  if (existing === contract) return;
  if (existing) throw new TimestampHistoryError("unknown timestamp contract marker");
  await executor.query({
    text: "SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended('metering:utc-adoption',0))",
    values: [],
  });
  if ((await readContract(executor)) === contract) return;
  await executor.execute({
    text: `LOCK TABLE ${guardedTables.join(",")},metering_command,metering_history_import IN SHARE MODE`,
    values: [],
  });
  let fenceAudit: Awaited<ReturnType<typeof auditTransportFences>>;
  try {
    await verifyTimestampHistory(executor);
    fenceAudit = await auditTransportFences(executor);
  } catch (error) {
    if (error instanceof TimestampHistoryError) throw error;
    throw new TimestampHistoryError("invalid historical timestamp evidence");
  }
  await executor.execute({
    text: "INSERT INTO metering_metadata(key,value) VALUES($1,$2)",
    values: ["bisibility.transport_fence_audit", JSON.stringify(fenceAudit)],
  });
  await executor.execute({
    text: "INSERT INTO metering_metadata(key,value) VALUES($1,$2)",
    values: [timestampContractKey, contract],
  });
}
