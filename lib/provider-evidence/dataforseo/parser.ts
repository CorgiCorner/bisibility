import { array, nullableCostCents, record, status } from "./outcomes";

export type { RecoveryTask, TaskClassification } from "@/lib/provider-evidence/recovery/adapter";

import type { RecoveryTask, TaskClassification } from "@/lib/provider-evidence/recovery/adapter";

function classify(code: number | null): TaskClassification {
  if (code === 20000) return "success";
  if (code === 40102) return "terminal_empty_success";
  if (code === 40106) return "partial";
  if (code === 40101) return "provider_error";
  if (code === 20100 || code === 40601 || code === 40602) return "pending";
  if (code === 40202 || code === 40209) return "rate_limited";
  if (code !== null && code >= 50000) return "outage";
  return "unknown_code";
}

function parseTask(value: unknown): RecoveryTask {
  const task = record(value);
  const taskStatus = status(task);
  const classification = classify(taskStatus.code);
  const results = array(task?.result).flatMap((item) => {
    const result = record(item);
    return result ? [result] : [];
  });
  const organicItems = results.flatMap((result) =>
    array(result.items).flatMap((item) => {
      const data = record(item);
      return data?.type === "organic" ? [data] : [];
    }),
  );
  const ranks = organicItems.flatMap((item) =>
    typeof item.rank_group === "number" && Number.isInteger(item.rank_group) && item.rank_group > 0
      ? [item.rank_group]
      : [],
  );
  return {
    id: typeof task?.id === "string" ? task.id : null,
    status: taskStatus,
    classification,
    costCents: nullableCostCents(task?.cost),
    submittedPayload: record(task?.data),
    results,
    organicItems,
    returnedDepth:
      classification === "terminal_empty_success" ? 0 : ranks.length ? Math.max(...ranks) : null,
    retryable: ["pending", "outage", "rate_limited"].includes(classification),
    suggestedBackoffMs: ["pending", "outage", "rate_limited"].includes(classification)
      ? 60_000
      : null,
  };
}

/** Preserves task evidence even when the envelope or an individual task reports an error. */
export function parseRecoveryGet(value: unknown) {
  const envelope = record(value);
  const topStatus = status(envelope);
  const tasks = array(envelope?.tasks).map(parseTask);
  const classification =
    topStatus.code !== 20000 ? classify(topStatus.code) : tasks.length ? "tasks" : "absent";
  const retryable =
    classification === "outage" ||
    classification === "rate_limited" ||
    (classification === "tasks" && tasks.some((task) => task.retryable));
  return {
    topStatus,
    classification,
    tasks,
    // Envelope cost can describe the lookup itself; only task cost measures the original task.
    acceptance: "unknown" as const,
    costCents: null,
    retryable,
    suggestedBackoffMs: retryable ? 60_000 : null,
  };
}
