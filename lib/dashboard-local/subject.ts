import "server-only";
import type { BusinessProjectScope } from "@/lib/business-location-store/access";
import { readBusinessAssignmentInTransaction } from "@/lib/business-location-store/assignment-read";
import type { BusinessTransaction } from "@/lib/business-location-store/context";
import { BusinessLocationConflictError } from "@/lib/business-location-store/errors";
import { loadBusinessLocation } from "@/lib/business-location-store/location-repository";
import { businessIdentityNormalizerVersion } from "@/lib/business-locations/dto";
import type { DashboardLocalSelection } from "./selection";

/** The public reference is a read selection, not permission or a mutable assignment command. */
export async function resolveDashboardLocalSubject(
  tx: BusinessTransaction,
  scope: BusinessProjectScope,
  selected: DashboardLocalSelection,
  asOf: Date,
) {
  const assigned = await readBusinessAssignmentInTransaction(tx, scope, selected.scope, asOf);
  const { row, location } = await loadBusinessLocation(tx, scope.project.id, selected.locationId);
  if (
    !assigned?.targetAvailable ||
    assigned.assignment.revision !== selected.assignmentRevision ||
    assigned.assignment.entityId !== row.id ||
    assigned.assignment.identityRevisionId !== selected.identityRevisionId ||
    location.currentRevision.normalizerVersion !== businessIdentityNormalizerVersion ||
    location.role !== "subject" ||
    location.state !== "active" ||
    location.currentRevision.id !== selected.identityRevisionId ||
    Date.parse(location.currentRevision.effectiveFrom) > asOf.getTime()
  )
    throw new BusinessLocationConflictError();
  return { assigned, location, row };
}
