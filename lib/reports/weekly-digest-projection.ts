import type { ProviderOperationEvidence } from "@/lib/generated/prisma/client";
import {
  aggregateIncident,
  type IncidentDimensions,
} from "@/lib/provider-evidence/incidents/dimensions";

export type DigestOperationDimensions = IncidentDimensions &
  Pick<ProviderOperationEvidence, "recoveryState">;

/** Recovery workflow state cannot overwrite independent result or cost evidence. */
export function digestOperationCounts(operations: DigestOperationDimensions[]) {
  return {
    ...aggregateIncident(operations).counts,
    costConflictCount: operations.filter((operation) => operation.accounting === "conflict").length,
  };
}
