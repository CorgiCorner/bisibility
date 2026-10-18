import { historySourceHash } from "@/lib/metering/history-evidence";
import { decimalQuantity } from "@/lib/metering/mapping";
import { projectAdmissionMeasurements } from "@/lib/metering/paid-measurements";
import { canonical, decode, hash } from "@/lib/metering/store/codec";
import type { CorrectionInput, Receipt } from "@usagekit/core";
import { type CloseoutManifest, closeoutPolicy } from "./manifest";
import type { CloseoutSnapshot } from "./snapshot";

export const closeoutManifestHash = (manifest: CloseoutManifest) => hash(canonical(manifest));
export function planCloseout(snapshot: CloseoutSnapshot, manifest: CloseoutManifest, now: Date) {
  const manifestHash = closeoutManifestHash(manifest);
  const targetHash = hash(canonical(snapshot.identity));
  const approvalReady = Boolean(
    snapshot.actor?.isInstanceAdmin &&
      snapshot.actor.emailVerified &&
      !snapshot.actor.deactivatedAt,
  );
  const previous = snapshot.entries.map((entry) => entry.disposition);
  if (previous.some(Boolean)) {
    const first = previous[0];
    if (
      !first ||
      previous.some((p, index) => {
        const entry = snapshot.entries[index]!;
        return (
          !p ||
          p.manifestHash !== manifestHash ||
          p.targetHash !== targetHash ||
          p.planHash !== first.planHash ||
          canonical(p.finalOperation) !== canonical(entry.operation) ||
          entry.operation.state !== "settled" ||
          entry.operation.version !== manifest.operations[index]!.expectedVersion + 1 ||
          entry.operation.receipts.length !== 2 ||
          entry.proofs.length ||
          entry.facts.binding ||
          entry.facts.evidence ||
          entry.facts.reference ||
          entry.facts.retainedIdentity ||
          entry.journal.source_hash !== historySourceHash(entry.source, entry.proofs)
        );
      })
    )
      throw new Error("Closeout replay conflicts with the approved batch or sealed operation.");
    return {
      manifestHash,
      targetHash,
      approvalReady,
      planHash: approvalReady ? first.planHash : null,
      replayed: true,
      corrections: [] as CorrectionInput[],
    };
  }
  const recorded = Date.parse(manifest.recordedAt);
  if (recorded > now.getTime() || now.getTime() - recorded > 86400000)
    throw new Error("A current, nonfuture closeout timestamp is required.");
  // Schema presence intentionally excluded: a read-only preview may precede DDL rollout.
  const { schemaAvailable: _, ...facts } = snapshot;
  const planHash = hash(canonical({ policy: closeoutPolicy, manifest, facts }));
  const corrections: CorrectionInput[] = [];
  for (const [index, entry] of snapshot.entries.entries()) {
    const item = manifest.operations[index];
    const { operation: op, source, journal } = entry;
    const original = decode<{ input: unknown; operation: unknown }>(journal.body);
    const receipt = op.receipts[0];
    if (
      !item ||
      !journal.created_operation ||
      journal.source_hash !== historySourceHash(source, entry.proofs) ||
      journal.target_hash !== hash(canonical(original.input)) ||
      canonical(op) !== canonical(original.operation)
    )
      throw new Error(
        "Only an unchanged original import with matching immutable hashes qualifies.",
      );
    if (
      op.scope.group !== snapshot.project.id ||
      op.scope.connection !== manifest.connection ||
      op.scope.namespace !== manifest.namespace ||
      source.projectId !== snapshot.project.id ||
      source.connectionId !== manifest.connection ||
      source.id !== journal.source_id
    )
      throw new Error("Historical project, connection or namespace mismatch.");
    if (
      op.version !== item.expectedVersion ||
      item.expectedVersion !== 1 ||
      op.state !== "pending" ||
      op.receipts.length !== 1 ||
      receipt?.id !== item.receiptId ||
      receipt.source !== "import" ||
      op.lease ||
      entry.leaseKind ||
      op.estimate.length ||
      entry.facts.binding ||
      entry.facts.evidence ||
      entry.facts.reference ||
      entry.facts.retainedIdentity ||
      entry.facts.commands !== 0n ||
      entry.proofs.length
    )
      throw new Error(
        "Active, revised, attributed or otherwise evidenced operations are ineligible.",
      );
    if (
      source.provider !== null ||
      op.provider !== "historical-unknown" ||
      source.credentialSource !== "own" ||
      op.fundingSource !== "byok" ||
      op.creditAccountRef ||
      op.customerPriceVersion ||
      op.platformPools?.length ||
      source.priceCents !== null ||
      source.usageQuantity !== null ||
      source.providerRequestId ||
      source.correlationId ||
      source.keywordId ||
      source.cached ||
      source.failed ||
      source.measurementStatus !== "recorded"
    )
      throw new Error(
        "Only irrecoverable original BYOK identity with retained measured money qualifies.",
      );
    if (
      receipt.cost.certainty !== "measured" ||
      !receipt.cost.money ||
      receipt.cost.money.currency !== "USD" ||
      receipt.cost.money.units < 0n ||
      receipt.cost.money.units !== decimalQuantity(source.costCents, "cents", 4).value ||
      receipt.cached ||
      receipt.failed ||
      receipt.providerRequestId
    )
      throw new Error(
        "Measured nonnegative USD cost is required; no new monetary attestation is accepted.",
      );
    const units = receipt.measurements.filter((m) => m.unit === "units");
    if (
      units.length !== 1 ||
      units[0].certainty !== "unknown" ||
      units[0].quantity !== null ||
      receipt.measurements.some(
        (m) => !["units", "cents", "budget_cents", "paid_attempts"].includes(m.unit),
      )
    )
      throw new Error("Only the original unknown native units dimension may be omitted.");
    const projected = projectAdmissionMeasurements(op, { ...receipt, measurements: [] });
    if (
      canonical(projected.measurements) !==
      canonical(receipt.measurements.filter((m) => m.unit !== "units"))
    )
      throw new Error(
        "Every monetary and paid-attempt dimension must match the retained measured cost.",
      );
    if (
      entry.budgets.some(
        (budget) =>
          !["cents", "budget_cents", "paid_attempts"].includes(budget.unit) ||
          budget.alerts?.length,
      )
    )
      throw new Error(
        "Native/custom budgets or retrospective budget alerts require attributable evidence.",
      );
    if (recorded < Math.max(Date.parse(receipt.recordedAt), Date.parse(receipt.occurredAt)))
      throw new Error("Closeout cannot precede the original receipt.");
    const id = hash(canonical([manifestHash, op.operationId]));
    const financial: Receipt & { metadata: Record<string, unknown> } = {
      id: `history-closeout:${id}`,
      source: "import",
      supersedes: receipt.id,
      occurredAt: receipt.occurredAt,
      recordedAt: manifest.recordedAt,
      cached: false,
      failed: false,
      evidenceRef: manifest.evidenceRef,
      cost: receipt.cost,
      measurements: projected.measurements,
      metadata: {
        historicalCloseout: {
          policy: closeoutPolicy,
          disposition: "financially_closed_identity_incomplete",
          omittedNativeDimensions: ["units"],
          providerIdentity: "unknown",
          manifestHash,
          planHash,
          targetHash,
          operator: manifest.operator,
          reason: manifest.reason,
          evidenceRef: manifest.evidenceRef,
        },
      },
    };
    corrections.push({
      namespace: manifest.namespace,
      principal: op.scope.principal,
      operationId: op.operationId,
      commandId: `history-closeout:${id}`,
      expectedVersion: item.expectedVersion,
      authority: { kind: "late_evidence", source: "operator_historical_financial_closeout" },
      replacesReceiptId: receipt.id,
      reason: manifest.reason,
      receipt: financial,
    });
  }
  return {
    manifestHash,
    targetHash,
    approvalReady,
    planHash: approvalReady ? planHash : null,
    replayed: false,
    corrections: approvalReady ? corrections : [],
  };
}
