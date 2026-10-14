import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import type { ExecutionTargetV1 } from "@/lib/local-monitoring/types";
import { localDigest } from "./canonical";

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
/** Unknown time is retained evidence, never a license to invent a business decision timestamp. */
export function unknownLocalObservationTime(
  run: {
    id: string;
    projectId: string;
    provider: string;
    surface: string;
    engine: string;
    neutralExecutionItemId: string | null;
    requestPolicy: unknown;
    items: readonly { observedAt: Date | null }[];
  },
  record: SubmissionRecord,
  itemId: string,
  target: ExecutionTargetV1,
) {
  const policy = object(run.requestPolicy),
    evidence = object(policy?.evidence),
    original = object(policy?.localExecution);
  if (evidence?.observedAt !== null) return false;
  if (
    run.projectId !== record.scope.projectId ||
    run.provider !== record.provider ||
    run.surface !== target.surface ||
    run.engine !== target.engine ||
    policy?.depth !== target.cutoff ||
    policy?.cutoff !== target.cutoff ||
    policy?.zoom !== target.zoom ||
    policy?.policyRevision !== target.policyRevision ||
    evidence.policyRevision !== target.policyRevision ||
    run.neutralExecutionItemId !== itemId ||
    !record.outcome ||
    evidence.version !== 1 ||
    evidence.adapterVersion !== record.adapterVersion ||
    evidence.targetRevision !== record.targetKey ||
    original?.version !== 1 ||
    original.operationKey !== record.key ||
    original.targetKey !== record.targetKey ||
    original.acceptedTaskIdsHash !== localDigest([...record.outcome.taskIds].sort()) ||
    run.items.some((item) => item.observedAt !== null)
  )
    throw new Error("Unknown observation time changed its original evidence binding.");
  return true;
}
