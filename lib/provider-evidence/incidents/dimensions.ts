import type { ProviderOperationEvidence } from "@/lib/generated/prisma/client";

export type IncidentDimensions = Pick<
  ProviderOperationEvidence,
  "acceptance" | "fulfillment" | "accounting" | "exhaustionStatus" | "exhaustionReason"
>;

/** Operator follow-up and recoveryState never establish customer resolution. */
export function operationResolved(value: IncidentDimensions): boolean {
  return (
    (value.acceptance === "accepted" || value.acceptance === "rejected") &&
    (value.fulfillment === "complete" ||
      value.fulfillment === "partial" ||
      value.fulfillment === "provider_error") &&
    (value.accounting === "measured" || finallyUnknown(value))
  );
}

function finallyUnknown(value: IncidentDimensions): boolean {
  return (
    value.accounting === "unknown" &&
    value.exhaustionStatus === "exhausted" &&
    !!value.exhaustionReason?.trim()
  );
}

/** Results and costs are independent; pending uncertainty is never a zero cost. */
export function customerDimensions(value: IncidentDimensions) {
  const result =
    value.fulfillment === "complete"
      ? "resultRecoveredCount"
      : value.fulfillment === "partial"
        ? "resultPartialCount"
        : value.fulfillment === "provider_error"
          ? "resultProviderErrorCount"
          : value.fulfillment === "absent"
            ? "resultMissingCount"
            : "resultUnderReviewCount";
  const cost =
    value.accounting === "measured"
      ? "costMeasuredCount"
      : finallyUnknown(value)
        ? "costUnknownCount"
        : "costUnderReviewCount";
  return { result, cost } as const;
}

export function emptyIncidentCounts() {
  return {
    resultUnderReviewCount: 0,
    resultRecoveredCount: 0,
    resultPartialCount: 0,
    resultProviderErrorCount: 0,
    resultMissingCount: 0,
    costMeasuredCount: 0,
    costUnknownCount: 0,
    costUnderReviewCount: 0,
  };
}
export type IncidentCounts = ReturnType<typeof emptyIncidentCounts>;

export function aggregateIncident(operations: IncidentDimensions[]) {
  const counts = emptyIncidentCounts();
  for (const operation of operations) {
    const { result, cost } = customerDimensions(operation);
    counts[result]++;
    counts[cost]++;
  }
  return { counts, resolved: operations.length > 0 && operations.every(operationResolved) };
}
