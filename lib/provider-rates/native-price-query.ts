import "server-only";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import {
  type NativePriceBinding,
  type NativePriceSample,
  nativeMeasuredPrice,
} from "./native-price-samples";
import { MAX_PROVIDER_RATE_SAMPLES, PROVIDER_RATE_TRAILING_DAYS } from "./resolver";

/** A read-only projection of the latest native receipt and its retained pricing inputs.
 * Meter consumes request options before Store persistence; their durable authority is
 * the validated paid-attempt context, not a nonexistent Store input.options field. */
export function nativePriceQuery(
  binding: NativePriceBinding,
  operation: string,
  options: Readonly<Record<string, string>>,
  now: Date,
) {
  const cutoff = new Date(now.getTime() - PROVIDER_RATE_TRAILING_DAYS * 86_400_000);
  return Prisma.sql`SELECT * FROM (
    SELECT DISTINCT ON (COALESCE('request:' || NULLIF(r.body->>'providerRequestId',''), 'operation:' || o.operation_id))
      o.namespace, o.principal, o.operation_id AS "operationId", o.state,
      o.input->'scope'->>'group' AS "projectId",
      o.input->'scope'->>'connection' AS "connectionId",
      o.input->'scope'->>'providerCredentialVersion' AS "providerCredentialVersion",
      o.input->>'fundingSource' AS "fundingSource", o.input->>'provider' AS provider,
      o.input->>'operation' AS operation, c.context->'requestPricing'->'options' AS options,
      'native' AS origin, r.occurred_at AS "occurredAt",
      (r.cost_units::numeric/10000)::numeric(20,4)::text AS "costCents", r.cost_certainty AS "costCertainty",
      (r.body->>'cached')::boolean AS cached, (r.body->>'failed')::boolean AS failed,
      false AS "chargeReplayed", NULLIF(r.body->>'providerRequestId','') AS "providerRequestId"
    FROM metering_operation o
    JOIN metering_paid_attempt_context c
      ON c.namespace=o.namespace AND c.principal=o.principal AND c.operation_id=o.operation_id
    JOIN LATERAL (SELECT * FROM metering_receipt receipt
      WHERE receipt.operation_pk=o.operation_pk ORDER BY receipt.sequence DESC LIMIT 1) r ON true
    WHERE o.namespace=${binding.namespace} AND o.principal=${binding.principal}
      AND o.input->'scope'->>'group'=${binding.projectId}
      AND o.input->'scope'->>'connection'=${binding.connectionId}
      AND o.input->'scope'->>'providerCredentialVersion'=${binding.providerCredentialVersion}
      AND o.input->>'fundingSource'=${binding.fundingSource}
      AND o.input->>'fundingSource'='byok' AND o.input->>'provider'=${binding.provider}
      AND o.input->>'operation'=${operation}
      AND c.context->'requestPricing'->'options'=${JSON.stringify(options)}::jsonb
      AND o.state='settled' AND r.cost_certainty='measured' AND r.cost_units>0
      AND r.body->>'source'='dispatch' AND r.body->>'cached'='false' AND r.body->>'failed'='false'
      AND COALESCE(c.context->>'chargeReplayed','false')='false'
      AND COALESCE(r.body->'metadata'->>'chargeReplayed','false')='false'
      AND c.context->'requestPricing'->>'version'='1'
      AND c.context->'requestPricing'->>'provider'=o.input->>'provider'
      AND c.context->'requestPricing'->>'operation'=o.input->>'operation'
      AND r.occurred_at>=${cutoff} AND r.occurred_at<=${now}
    ORDER BY COALESCE('request:' || NULLIF(r.body->>'providerRequestId',''), 'operation:' || o.operation_id),
      r.occurred_at DESC, o.operation_id
  ) samples ORDER BY "occurredAt" DESC, "operationId" LIMIT ${MAX_PROVIDER_RATE_SAMPLES}`;
}

/** The caller supplies a live, server-authorized binding. Platform customer prices use
 * their own policy; provider evidence can never price those credits. No accounting writes. */
export async function loadNativeMeasuredPrice(
  client: Pick<PrismaClient, "$queryRaw">,
  binding: NativePriceBinding,
  operation: string,
  options: Readonly<Record<string, string>>,
  now = new Date(),
) {
  if (binding.fundingSource !== "byok") return undefined;
  const samples = await client.$queryRaw<NativePriceSample[]>(
    nativePriceQuery(binding, operation, options, now),
  );
  return nativeMeasuredPrice(binding, operation, options, samples, now);
}
