import type { RecoveryEvidenceView } from "@/lib/metering/recovery/evidence-model";

export function recoveryEvidenceSortValue(
  value: RecoveryEvidenceView | undefined,
  column: string,
  showCost = true,
) {
  const projection = value?.projection;
  if (column === "incident") return value?.incident?.openedAt;
  if (column === "lookup")
    return projection?.recovery?.lastAttemptAt ?? projection?.recovery?.nextAttemptAt ?? undefined;
  if (!projection) return undefined;
  if (column === "classification")
    return `${projection.result ?? ""} ${showCost ? (projection.cost ?? "") : ""}`;
  return `${projection.acceptance ?? ""} ${projection.recovery?.state ?? ""}`;
}
