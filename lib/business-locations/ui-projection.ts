import type { StoredBusinessLocation } from "@/lib/business-location-store/location-repository";
import type { StoredEntityMatch } from "@/lib/business-location-store/match-repository";
import type { IdentityRevision } from "./dto";
import type { IdentitySummary, LocationSummary, MatchSummary } from "./ui-contracts";

export function identitySummary(revision: IdentityRevision): IdentitySummary {
  const { snapshot } = revision;
  return {
    revisionId: revision.id,
    revision: revision.revision,
    name: snapshot.name,
    address: snapshot.address ?? null,
    domain: snapshot.domain ?? null,
    coordinates: snapshot.coordinates
      ? { latitude: snapshot.coordinates.latitude, longitude: snapshot.coordinates.longitude }
      : null,
    mapsUrl: snapshot.mapsUrl ?? null,
    identifiers: snapshot.identifiers.map(({ type, value }) => ({ type, value })),
  };
}

/** Call at the authorized server read boundary before passing anything to client UI. */
export function locationSummary(location: StoredBusinessLocation): LocationSummary {
  return {
    publicId: location.publicId,
    version: location.version,
    role: location.role,
    state: location.state,
    identity: identitySummary(location.currentRevision),
  };
}
export function matchSummary(
  decision: StoredEntityMatch,
  locationId: string,
  surface: MatchSummary["surface"],
  display: {
    locationName: string;
    locationAddress: string | null;
    itemName: string | null;
    itemDomain: string | null;
  } | null = null,
): MatchSummary {
  return {
    locationId,
    identityRevisionId: decision.identityRevisionId,
    observationRunId: decision.observationRunId,
    itemId: decision.itemId,
    decisionId: decision.id,
    decisionRevision: decision.decisionRevision,
    matcherVersion: decision.matcherVersion,
    source: decision.source,
    recordedAt: decision.recordedAt,
    status: decision.status,
    reason: decision.reason,
    matchedBy: decision.matchedBy,
    promotion: decision.promotion,
    surface,
    observedAt: decision.observedAt,
    originalOrdinals: {
      page: decision.originalOrdinals.page,
      block: decision.originalOrdinals.block,
      slot: decision.originalOrdinals.slot,
      absolute: decision.originalOrdinals.absolute,
      ...(decision.originalOrdinals.group === undefined
        ? {}
        : { group: decision.originalOrdinals.group }),
      ...(decision.originalOrdinals.scale === undefined
        ? {}
        : { scale: decision.originalOrdinals.scale }),
    },
    sourceOrdinal: decision.observationSource.sourceOrdinal,
    rankScale: decision.observationSource.rankScale,
    locationName: display?.locationName ?? null,
    locationAddress: display?.locationAddress ?? null,
    itemName: display?.itemName ?? null,
    itemDomain: display?.itemDomain ?? null,
  };
}
export function isReviewableCandidate(match: MatchSummary): boolean {
  return (
    match.status === "candidate" &&
    ["weak_name", "weak_domain", "weak_name_and_domain"].includes(match.reason) &&
    ["name", "domain", "name_and_domain"].includes(match.matchedBy ?? "")
  );
}
