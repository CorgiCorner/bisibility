import { canonical, decode, hash } from "@/lib/metering/store/codec";
import type { CorrectionInput, Receipt } from "@usagekit/core";
import type { HistoricalResolution } from "./manifest";
import { historicalResolutionReceipt } from "./receipt";
import { type HistorySnapshot, journalOperation, resolutionCommandId } from "./snapshot";

type Attestation = {
  historicalResolution: { planHash: string; manifestHash: string; databaseIdentityHash: string };
};
export type HistoricalResolutionPlan = {
  planHash: string;
  replayed: boolean;
  corrections: CorrectionInput[];
};
export const manifestIdentity = (manifest: HistoricalResolution) => hash(canonical(manifest));

/** Replays precede current version/budget checks: later evidence must never be overwritten. */
function replay(snapshot: HistorySnapshot, manifestHash: string, databaseIdentityHash: string) {
  const commands = snapshot.entries.filter((e) => e.command);
  if (!commands.length) return null;
  if (commands.length !== snapshot.entries.length)
    throw new Error("Mixed applied and unapplied manifest; inspect the original batch.");
  const hashes = commands.map(({ command, operation }) => {
    if (!command) throw new Error("Missing historical resolution command.");
    const input = decode<CorrectionInput>(command.input);
    const metadata = (input.receipt as Receipt & { metadata?: Attestation }).metadata
      ?.historicalResolution;
    const retained = operation.receipts.find((r) => r.id === input.receipt.id);
    const result = decode<{ outcome: string }>(command.result);
    if (
      command.kind !== "correct" ||
      result.outcome !== "settled" ||
      command.input_hash !== hash(canonical({ kind: "correct", input })) ||
      input.namespace !== operation.scope.namespace ||
      input.operationId !== operation.operationId ||
      input.commandId !== resolutionCommandId(manifestHash, operation.operationId) ||
      metadata?.manifestHash !== manifestHash ||
      metadata.databaseIdentityHash !== databaseIdentityHash ||
      !retained ||
      canonical(retained) !== canonical(input.receipt)
    )
      throw new Error("Stored historical resolution does not match this database and manifest.");
    return metadata.planHash;
  });
  if (new Set(hashes).size !== 1) throw new Error("Stored batch approval hashes disagree.");
  const [approved] = hashes;
  if (!approved) throw new Error("Missing original approval hash.");
  return approved;
}

/** Pure validation over a read-only snapshot; it never constructs a writable Meter. */
export function planHistoricalResolution(
  snapshot: HistorySnapshot,
  manifest: HistoricalResolution,
  now: Date,
): HistoricalResolutionPlan {
  const manifestHash = manifestIdentity(manifest);
  const databaseIdentityHash = hash(canonical(snapshot.identity));
  const previous = replay(snapshot, manifestHash, databaseIdentityHash);
  if (previous) return { planHash: previous, replayed: true, corrections: [] };
  if (Date.parse(manifest.recordedAt) > now.getTime())
    throw new Error("Resolution recordedAt cannot be in the future.");
  const planHash = hash(canonical({ manifest, snapshot }));
  const corrections = snapshot.entries.map((entry) => {
    const { operation, journal, leaseKind, binding, nativeProof, budgets } = entry;
    const item = manifest.operations.find((i) => i.operationId === operation.operationId);
    const original = operation.receipts[0];
    const imported = journalOperation(journal);
    if (
      !item ||
      !original ||
      !journal.created_operation ||
      journal.target_hash !== hash(canonical(imported.input)) ||
      canonical(operation) !== canonical(imported.operation) ||
      operation.scope.namespace !== manifest.namespace ||
      operation.scope.connection !== manifest.connection ||
      operation.fundingSource !== "byok" ||
      !["dataforseo", "serpapi"].includes(operation.provider) ||
      operation.state !== "pending" ||
      operation.lease ||
      leaseKind ||
      binding ||
      operation.version !== item.expectedVersion ||
      original.id !== item.receiptId ||
      operation.receipts.length !== 1 ||
      original.source !== "import"
    )
      throw new Error("Only untouched, pending, original BYOK historical imports can be resolved.");
    if (nativeProof)
      throw new Error("Retained native proof is available; use normal usage reconciliation first.");
    const receipt = historicalResolutionReceipt(operation, original, item, manifest, {
      databaseRole: snapshot.identity.role,
      requiresUnits:
        budgets.some((b) => b.unit === "units") ||
        operation.estimate.some((q) => q.unit === "units"),
      receiptId: resolutionCommandId(manifestHash, operation.operationId),
      planHash,
      manifestHash,
      databaseIdentityHash,
    });
    for (const unit of [...budgets.map((b) => b.unit), ...operation.estimate.map((q) => q.unit)]) {
      if (
        !receipt.measurements.some(
          (m) => m.unit === unit && m.certainty === "measured" && m.quantity,
        )
      )
        throw new Error(
          "Every retained estimate and matching budget dimension requires measured evidence.",
        );
    }
    return {
      namespace: manifest.namespace,
      principal: operation.scope.principal,
      operationId: operation.operationId,
      commandId: resolutionCommandId(manifestHash, operation.operationId),
      expectedVersion: item.expectedVersion,
      authority: { kind: "late_evidence" as const, source: "operator_historical_resolution" },
      replacesReceiptId: original.id,
      reason: manifest.reason,
      receipt,
    };
  });
  return { planHash, replayed: false, corrections };
}
