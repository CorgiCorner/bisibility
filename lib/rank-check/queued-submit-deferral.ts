import { OperationAccessDeniedError } from "@/lib/operations/access-error";
import { WeeklyRequestCapError } from "@/lib/operations/weekly-request-error";
import {
  DeploymentAdmissionExhaustedError,
  OwnProviderKeyRequiredError,
} from "@/lib/providers/execution-extension-errors";
import { deferQueuedRankCheckBatch } from "./queued-lifecycle";

export function isQueuedAdmissionDeferral(
  error: unknown,
): error is DeploymentAdmissionExhaustedError | WeeklyRequestCapError {
  return (
    error instanceof DeploymentAdmissionExhaustedError || error instanceof WeeklyRequestCapError
  );
}

/** Own-key refusals keep their actionable message; the other refusals keep their reason codes. */
export function admissionDeferral(
  error: DeploymentAdmissionExhaustedError | OperationAccessDeniedError,
) {
  if (error instanceof WeeklyRequestCapError) return `${error.code}:${error.resetsAt}`;
  if (error instanceof OperationAccessDeniedError) return error.message;
  if (error instanceof OwnProviderKeyRequiredError) return error.message;
  return error.reason === "balance"
    ? "credits_exhausted"
    : `budget_exhausted:${error.surface ?? "app"}`;
}

export async function deferQueuedAdmission(
  batchId: string,
  error: DeploymentAdmissionExhaustedError | OperationAccessDeniedError,
) {
  const args = [batchId, admissionDeferral(error)] as const;
  const progress =
    error instanceof WeeklyRequestCapError
      ? await deferQueuedRankCheckBatch(...args, { preSend: true })
      : await deferQueuedRankCheckBatch(...args);
  return { state: progress.state };
}
