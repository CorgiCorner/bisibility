import { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "./runtime";

/** One row per effective paid operation. Corrections replace evidence; they never add usage.
 * Attribution is retained independently of business records. Estimates are not actuals.
 */
export function canonicalUsageSql(namespace = meteringNamespace(), includeUnsent = false) {
  const replayed = Prisma.sql`COALESCE((c.context->>'chargeReplayed')::boolean,(r.body->'metadata'->>'chargeReplayed')::boolean,false)`;
  return Prisma.sql`SELECT o.namespace, o.principal, o.operation_id AS id,
    o.operation_pk, o.state, o.input->>'provider' AS provider,
    COALESCE(c.context->>'feature',o.input->>'operation') AS feature, o.input->>'source' AS source,
    o.input->>'surface' AS surface, o.input->>'fundingSource' AS "fundingSource",
    o.input->'scope'->>'group' AS "projectId",
    o.input->'scope'->>'connection' AS "connectionId",
    o.input->'scope'->>'providerCredentialVersion' AS "providerCredentialVersion",
    o.input->'scope'->'accessCredential'->>'kind' AS "credentialKind",
    o.input->'scope'->'accessCredential'->>'id' AS "credentialId",
    COALESCE(c.context->>'correlationId',o.input->>'correlationId') AS "correlationId",
    COALESCE(c.context->>'keywordId',p.legacy->>'keywordId') AS "keywordId",
    c.context->>'rankCheckId' AS "rankCheckId", c.context->>'rankCheckRunId' AS "rankCheckRunId",
    c.context->>'rankCheckRunItemId' AS "rankCheckRunItemId",
    COALESCE(c.context->>'trigger',p.legacy->>'trigger') AS trigger,
    COALESCE(c.context->>'tag',p.legacy->>'tag',c.context->>'correlationId',o.input->>'correlationId') AS tag,
    CASE WHEN o.input->>'fundingSource'='platform' THEN 'hosted' ELSE 'own' END AS "credentialSource",
    COALESCE(r.occurred_at,o.created_at) AS "createdAt",
    COALESCE((r.body->>'cached')::boolean,false) AS cached,
    COALESCE((r.body->>'failed')::boolean,false) AS failed,
    CASE WHEN r.cost_certainty='measured' THEN 'recorded' ELSE 'unknown' END AS "measurementStatus",
    CASE WHEN r.cost_certainty='measured' THEN r.cost_units::numeric/10000 END AS "costCents",
    m.units AS "usageQuantity",m.customer AS "priceCents",m.budget AS "budgetCents",
    COALESCE((r.body->'metadata'->'legacy'->>'unitCostCents')::numeric,
      (r.body->'metadata'->>'unitCostCents')::numeric) AS "unitCostCents",
    r.body->>'providerRequestId' AS "providerRequestId",r.receipt_id AS "receiptId",
    ${replayed} AS "chargeReplayed",
    CASE WHEN NOT ${replayed} THEN COALESCE(c.debit_id,r.body->'metadata'->>'debitId') END AS "debitId"
    FROM metering_operation o
    LEFT JOIN metering_paid_attempt_context c ON c.namespace=o.namespace AND c.operation_id=o.operation_id AND c.principal=o.principal
    LEFT JOIN LATERAL (SELECT * FROM metering_receipt e WHERE e.operation_pk=o.operation_pk ORDER BY e.sequence DESC LIMIT 1) r ON true
    LEFT JOIN LATERAL (SELECT e.body->'metadata'->'legacy' AS legacy FROM metering_receipt e
      WHERE e.operation_pk=o.operation_pk AND e.body->'metadata'->'legacy' IS NOT NULL ORDER BY e.sequence DESC LIMIT 1) p ON true
    LEFT JOIN LATERAL (SELECT
      MAX(value/power(10::numeric,scale)) FILTER(WHERE unit='units' AND certainty='measured') AS units,
      MAX(value/power(10::numeric,scale)) FILTER(WHERE unit='customer_cents' AND certainty='measured') AS customer,
      MAX(value/power(10::numeric,scale)) FILTER(WHERE unit='budget_cents' AND certainty='measured') AS budget
      FROM metering_measurement WHERE receipt_pk=r.receipt_pk) m ON true
    WHERE o.namespace=${namespace} AND ${includeUnsent ? Prisma.sql`true` : Prisma.sql`(o.state IN ('pending','settled') OR (o.state='dispatch_intended' AND c.fenced_at IS NOT NULL))`}`;
}
