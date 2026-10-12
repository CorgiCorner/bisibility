import type { Operation } from "@usagekit/core";
import { historicalOperation } from "./history-mapping";
import type { HistoricalIdentity, HistoricalReceipt, LegacyUsageSource } from "./history-types";
import { decimalQuantity } from "./mapping";
import { projectAdmissionMeasurements } from "./paid-measurements";
import { canonical, decode, effective, hash } from "./store/codec";
import { hydrate, type OperationRow } from "./store/records";
import { Prisma, type Sql } from "./store/sql";

type Proof = { kind: string; payload: unknown };
export async function historyProofs(sql: Sql, sourceId: string) {
  return sql.query<Proof>(
    Prisma.sql`SELECT kind,payload FROM metering_legacy_proof_source WHERE source_id=${sourceId} ORDER BY kind`,
  );
}
export const historySourceHash = (source: LegacyUsageSource, proofs: Proof[]) =>
  hash(canonical({ source, proofs }));
export async function historicalTarget(
  sql: Sql,
  legacy: LegacyUsageSource,
  namespace: string,
  cutoverAt: string,
  proofs: Proof[],
): Promise<Operation> {
  let identity: HistoricalIdentity = {};
  for (const proof of proofs) {
    const value = decode<
      HistoricalIdentity & {
        projectId?: string;
        connectionId?: string;
        provider?: string;
        estimate?: { cents?: string; units?: string; credentialVersion?: string };
        operationId?: string;
      }
    >(proof.payload);
    if (proof.kind === "byok" && value.estimate?.credentialVersion) {
      if (
        value.providerCredentialVersion &&
        value.providerCredentialVersion !== value.estimate.credentialVersion
      )
        throw new Error("Historical credential version conflict");
      value.providerCredentialVersion = value.estimate.credentialVersion;
    }
    if (
      (value.projectId && value.projectId !== legacy.projectId) ||
      (value.connectionId && value.connectionId !== legacy.connectionId) ||
      (value.provider && legacy.provider && value.provider !== legacy.provider)
    )
      throw new Error("Historical retained identity conflict");
    for (const field of [
      "namespace",
      "principal",
      "costOwner",
      "creditAccountRef",
      "customerCents",
      "debitId",
      "customerPriceVersion",
      "providerCredentialVersion",
      "platformPoolId",
      "canonicalId",
    ] as const) {
      const retained = value[field];
      if (!retained) continue;
      if (identity[field] && identity[field] !== retained)
        throw new Error("Historical financial identity conflict");
      identity = { ...identity, [field]: retained };
    }
    if (proof.kind === "byok")
      identity.estimate = [
        ...(value.estimate?.cents
          ? [
              decimalQuantity(value.estimate.cents, "cents", 4),
              decimalQuantity(value.estimate.cents, "budget_cents", 4),
            ]
          : []),
        ...(value.estimate?.units ? [decimalQuantity(value.estimate.units, "units", 6)] : []),
      ];
  }
  const proposed = historicalOperation(legacy, namespace, cutoverAt, identity);
  const rows = await sql.query<OperationRow>(
    Prisma.sql`SELECT * FROM metering_operation WHERE namespace=${identity.namespace ?? namespace} AND operation_id IN (${legacy.id},${`hosted-attempt:${legacy.id}`},${`legacy:${legacy.id}`})`,
  );
  if (rows.length > 1) throw new Error("Ambiguous historical canonical mapping");
  if (!rows[0]) return proposed;
  const existing = await hydrate(sql, rows[0]);
  if (
    (identity.namespace && identity.namespace !== existing.scope.namespace) ||
    (identity.principal && identity.principal !== existing.scope.principal) ||
    existing.scope.connection !== legacy.connectionId ||
    existing.scope.group !== legacy.projectId ||
    existing.provider !== proposed.provider ||
    existing.fundingSource !== proposed.fundingSource
  )
    throw new Error("Historical canonical identity conflict");
  const receipt = effective(existing);
  if (!receipt || existing.lease || !["pending", "settled", "released"].includes(existing.state))
    throw new Error("Historical canonical operation is active");
  // Compare the latest dispatch proof, allowing later probe evidence to remain authoritative.
  const native =
    [...existing.receipts].reverse().find((r) => r.source !== "import" && r.source !== "probe") ??
    receipt;
  const expected = proposed.receipts[0];
  if (
    !expected ||
    (legacy.providerRequestId && native.providerRequestId !== legacy.providerRequestId) ||
    (expected.cost.money && native.cost.money?.units !== expected.cost.money.units)
  )
    throw new Error("Historical native amount or receipt lineage conflict");
  const provenance: HistoricalReceipt = {
    ...projectAdmissionMeasurements(existing, receipt),
    id: `history-provenance:${hash(canonical([legacy, existing.scope.namespace, existing.operationId]))}`,
    source: "import",
    supersedes: receipt.id,
    recordedAt: cutoverAt,
    metadata: expected.metadata,
  };
  return {
    ...existing,
    version: existing.version + 1,
    updatedAt: cutoverAt,
    receipts: [...existing.receipts, provenance],
  };
}
