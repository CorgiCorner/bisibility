import { IdentityIdentifierClaimedError } from "@/lib/business-locations/identity-errors";
import { planIdentityRevision } from "@/lib/business-locations/identity-revisions";
import { BusinessLocationConflictError } from "./errors";

/** Translate only the planner's typed active-identifier collision. */
export function planStoredIdentity(input: Parameters<typeof planIdentityRevision>[0]) {
  try {
    return planIdentityRevision(input);
  } catch (cause) {
    if (cause instanceof IdentityIdentifierClaimedError)
      throw new BusinessLocationConflictError("identifier_claimed");
    throw cause;
  }
}
