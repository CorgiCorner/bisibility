import "server-only";

import type {
  AssignLocationCommand,
  AssignmentSummary,
  MatchSummary,
} from "@/lib/business-locations/ui-contracts";
import { locationSummary, matchSummary } from "@/lib/business-locations/ui-projection";
import { readBusinessAssignmentFor } from "./assignment-read";
import type { BusinessDatabase, BusinessStoreContext } from "./context";
import { BusinessLocationUnavailableError } from "./errors";
import { listBusinessLocationsFor, readBusinessLocationFor } from "./location-read";
import { readBusinessMatchesFor } from "./match-read";

export async function readLocationSummaryFor(
  projectId: string,
  locationId: string,
  context: BusinessStoreContext,
  db?: BusinessDatabase,
) {
  return locationSummary(
    (await readBusinessLocationFor(projectId, locationId, context, db)).location,
  );
}
export async function readLocationListSummaryFor(
  projectId: string,
  context: BusinessStoreContext,
  db?: BusinessDatabase,
) {
  const result = await listBusinessLocationsFor(projectId, context, db);
  return { permissions: result.permissions, locations: result.locations.map(locationSummary) };
}
export async function readAssignmentSummaryFor(
  projectId: string,
  selected: AssignLocationCommand["scope"],
  context: BusinessStoreContext,
  db?: BusinessDatabase,
): Promise<AssignmentSummary> {
  const result = await readBusinessAssignmentFor(projectId, selected, context, db);
  const registry = await listBusinessLocationsFor(projectId, context, db);
  const target = result.current?.entityId
    ? registry.locations.find(({ id }) => id === result.current?.entityId)
    : null;
  return {
    scope: selected,
    revision: result.current?.revision ?? 0,
    targetAvailable: result.targetAvailable,
    target:
      target && result.current?.identityRevisionId
        ? { locationId: target.publicId, identityRevisionId: result.current.identityRevisionId }
        : null,
  };
}
export async function readMatchSummariesFor(
  projectId: string,
  locationId: string,
  runId: string,
  context: BusinessStoreContext,
  db?: BusinessDatabase,
) {
  const [result, location] = await Promise.all([
    readBusinessMatchesFor(projectId, locationId, runId, context, db),
    readLocationSummaryFor(projectId, locationId, context, db),
  ]);
  if (
    result.surface !== "web_serp" &&
    result.surface !== "maps" &&
    result.surface !== "local_finder"
  )
    throw new BusinessLocationUnavailableError();
  const latest = new Map<string, (typeof result.decisions)[number]>();
  for (const decision of result.decisions) {
    const current = latest.get(decision.itemId);
    if (!current || current.decisionRevision < decision.decisionRevision)
      latest.set(decision.itemId, decision);
  }
  return [...latest.values()].map((decision): MatchSummary => {
    const item = result.items.find(({ id }) => id === decision.itemId);
    return matchSummary(decision, locationId, result.surface as MatchSummary["surface"], {
      locationName: location.identity.name,
      locationAddress: location.identity.address,
      itemName: item?.businessName ?? null,
      itemDomain: item?.domain ?? null,
    });
  });
}
