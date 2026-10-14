import { ACTIVE_QUEUED_TASK_STATES } from "@/lib/rank-check/queued-state";
import { qualifyMeasurement } from "@/lib/rank-measurements/qualify";
import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import type { KeywordRowInput } from "./keyword-row-input";
import type { KeywordCheckState } from "./keyword-row-types";

export function keywordCheckState(
  check:
    | (Pick<KeywordRowInput["rankChecks"][number], "position" | "status" | "observationRun"> &
        Partial<KeywordRowInput["rankChecks"][number]>)
    | null,
  queuedTasks: ReadonlyArray<{ state: string }>,
): KeywordCheckState {
  if (check?.status === "running") return "running";
  if (check?.status === "failed") return "failed";
  if (check?.status && check.status !== "completed") return "never_checked";
  if (queuedTasks.some((task) => ACTIVE_QUEUED_TASK_STATES.includes(task.state))) return "running";
  if (!check) return "never_checked";
  if (check.position !== null) return "ranked";
  const qualified = qualifyMeasurement(
    recordedMeasurement(
      {
        ...check,
        normalizationVersion: check.normalizationVersion ?? null,
        requestedDepth: check.requestedDepth ?? null,
      },
      "target",
    ),
    { asOf: new Date(), horizon: check.requestedDepth ?? 100 },
  );
  return qualified.evidence === "known_absent" ? "not_ranked" : "unknown";
}
