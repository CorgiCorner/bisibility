import type { ProviderOperationEvidence } from "@/lib/generated/prisma/client";
import { customerDimensions } from "@/lib/provider-evidence/incidents/dimensions";
import { isRestoredCheck } from "@/lib/rank-check/restored-check";

export type ResultProjection =
  | "under_review"
  | "recovered"
  | "partial"
  | "provider_error"
  | "missing";
export type CostProjection = "measured" | "unknown" | "under_review" | "conflict";
export type OperationProjectionSource = {
  operationPk: string;
  provider: string;
  accountingOnly: boolean;
  evidence: Pick<
    ProviderOperationEvidence,
    | "acceptance"
    | "fulfillment"
    | "returnedDepth"
    | "accounting"
    | "exhaustionStatus"
    | "exhaustionReason"
    | "recoveryState"
    | "lastAttemptAt"
    | "nextAttemptAt"
    | "recoveryReason"
  > | null;
};
export type CheckProjectionSource = {
  attemptCount: number;
  checkedAt: Date;
  provider: string;
  status: string;
  recoveryRestoredAt: Date | null;
  recoveryProvenance: unknown;
  partialEvidence: readonly { kind: string; returnedDepth: number | null }[];
};
export type EvidenceProjection = {
  acceptance: ProviderOperationEvidence["acceptance"];
  fulfillment: ProviderOperationEvidence["fulfillment"];
  returnedDepth: number | null;
  accounting: ProviderOperationEvidence["accounting"];
  recovery: {
    state: ProviderOperationEvidence["recoveryState"];
    lastAttemptAt: string | null;
    nextAttemptAt: string | null;
    reason: string | null;
  } | null;
  result: ResultProjection | null;
  cost: CostProjection | null;
  originalCheckedAt: string;
};
const resultNames = {
  resultUnderReviewCount: "under_review",
  resultRecoveredCount: "recovered",
  resultPartialCount: "partial",
  resultProviderErrorCount: "provider_error",
  resultMissingCount: "missing",
} as const;
const costNames = {
  costMeasuredCount: "measured",
  costUnknownCount: "unknown",
  costUnderReviewCount: "under_review",
} as const;

function provenanceOperation(value: unknown) {
  return value &&
    typeof value === "object" &&
    "operationPk" in value &&
    typeof value.operationPk === "string"
    ? value.operationPk
    : null;
}
/** Ambiguous attempt identity stays unknown; it never borrows an earlier attempt's result. */
function resultOperation(
  check: CheckProjectionSource,
  operations: readonly OperationProjectionSource[],
) {
  const restored = isRestoredCheck(check);
  const original = provenanceOperation(check.recoveryProvenance);
  if (original && (restored || check.status !== "completed"))
    return operations.find(
      (operation) => operation.operationPk === original && (restored || !operation.accountingOnly),
    );
  if (check.status === "completed" && check.attemptCount > operations.length) return undefined;
  const candidates = operations.filter(
    (operation) =>
      !operation.accountingOnly &&
      (check.status !== "completed" || operation.provider === check.provider),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Financial evidence from every attempt contributes only to cost, never the winning result. */
export function projectCheckEvidence(
  check: CheckProjectionSource,
  operations: readonly OperationProjectionSource[],
): EvidenceProjection | null {
  operations = operations.map((operation) => {
    const value = operation.evidence;
    const classified =
      value &&
      (value.acceptance !== null ||
        value.fulfillment !== null ||
        value.accounting !== null ||
        (value.recoveryState !== null && value.recoveryState !== "not_needed"));
    return classified ? operation : { ...operation, evidence: null };
  });
  const evidence = operations.flatMap((operation) =>
    operation.evidence ? [operation.evidence] : [],
  );
  const restored = isRestoredCheck(check);
  if (!evidence.length && !check.partialEvidence.length && !restored) return null;
  const winner = resultOperation(check, operations)?.evidence;
  const partial =
    check.status !== "completed" &&
    (!winner || winner.fulfillment === null || winner.fulfillment === "partial")
      ? check.partialEvidence[0]
      : undefined;
  const costs = evidence.map((value) =>
    value.accounting === "conflict"
      ? ("conflict" as const)
      : costNames[customerDimensions(value).cost],
  );
  const cost =
    (["conflict", "under_review", "unknown", "measured"] as const).find((value) =>
      costs.includes(value),
    ) ?? null;
  const accounting = evidence.some((value) => value.accounting === "conflict")
    ? "conflict"
    : evidence.some((value) => value.accounting === "unknown")
      ? "unknown"
      : evidence.some((value) => value.accounting === "measured")
        ? "measured"
        : null;
  return {
    acceptance: winner?.acceptance ?? null,
    fulfillment: winner?.fulfillment ?? (partial?.kind === "partial" ? "partial" : null),
    returnedDepth: winner?.returnedDepth ?? partial?.returnedDepth ?? null,
    accounting,
    recovery: winner
      ? {
          state: winner.recoveryState,
          lastAttemptAt: winner.lastAttemptAt?.toISOString() ?? null,
          nextAttemptAt: winner.nextAttemptAt?.toISOString() ?? null,
          reason: winner.recoveryReason,
        }
      : null,
    result: restored
      ? "recovered"
      : partial?.kind === "partial"
        ? "partial"
        : winner
          ? resultNames[customerDimensions(winner).result]
          : partial
            ? "under_review"
            : null,
    cost,
    originalCheckedAt: check.checkedAt.toISOString(),
  };
}

export const projectionKeys = [
  "under_review",
  "recovered",
  "partial",
  "provider_error",
  "missing",
  "cost_conflict",
] as const;
export type ProjectionKey = (typeof projectionKeys)[number];
export function evidenceMatches(value: EvidenceProjection | null, filter: ProjectionKey) {
  return filter === "cost_conflict" ? value?.cost === "conflict" : value?.result === filter;
}
export function projectionCounts(values: Iterable<EvidenceProjection | null>) {
  const counts = Object.fromEntries(projectionKeys.map((key) => [key, 0])) as Record<
    ProjectionKey,
    number
  >;
  for (const value of values)
    for (const key of projectionKeys) if (evidenceMatches(value, key)) counts[key]++;
  return counts;
}
