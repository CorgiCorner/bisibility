import { MODEL_IN_FLIGHT_MS } from "./admission-state";
// store-columns: a dispatch fence is still claimed; expiry changes it to unknown.
export const REPORT_TERMINAL_STATES = [
  "completed",
  "partial",
  "cancelled",
  "failed",
  "unknown",
] as const;
export function isTerminalReportRun(
  run: {
    columns: readonly { state: unknown; result?: unknown; dispatchStartedAt?: Date | null }[];
  },
  now = new Date(),
): boolean {
  return (
    run.columns.length > 0 &&
    run.columns.every(
      (column) =>
        REPORT_TERMINAL_STATES.some((state) => state === column.state) &&
        (column.state !== "unknown" ||
          column.result != null ||
          (column.dispatchStartedAt instanceof Date &&
            column.dispatchStartedAt.getTime() + MODEL_IN_FLIGHT_MS <= now.getTime())),
    )
  );
}

export type ReportSaveStatus =
  | "saving"
  | "pending"
  | "saved"
  | "check_failed"
  | "storage"
  | "forbidden"
  | "read_only"
  | "too_large"
  | "unavailable"
  | "unclassified"
  | "dismissed";

const typedSaveReasons = [
  "pending",
  "storage",
  "forbidden",
  "too_large",
  "read_only",
  "unclassified",
  "dismissed",
] as const satisfies readonly ReportSaveStatus[];

/** Save refusals stay typed through the client. Anything else is unavailable. */
export function reportSaveStatusForReason(reason: string): ReportSaveStatus {
  if (reason === "held") return "read_only";
  return typedSaveReasons.some((status) => status === reason)
    ? (reason as ReportSaveStatus)
    : "unavailable";
}
