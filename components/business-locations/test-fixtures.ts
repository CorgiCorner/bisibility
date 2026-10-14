import sharedMessages from "@/messages/core/en/shared.json";
import { createTranslator } from "use-intl/core";
import type {
  AssignmentSummary,
  BusinessTranslator,
  LocationSummary,
  MatchSummary,
} from "./contracts";

export const projectId = `prj_${"a".repeat(24)}`;
export const ownerPermissions = { canRead: true, canWrite: true } as const;
export const viewerPermissions = { canRead: true, canWrite: false } as const;
export const northBranch: LocationSummary = {
  publicId: `biz_${"b".repeat(24)}`,
  version: 4,
  role: "subject",
  state: "active",
  identity: {
    revisionId: "identity-north-v3",
    revision: 3,
    name: "Example Coffee North",
    address: "10 North Street",
    domain: "example.test",
    coordinates: { latitude: 52.23, longitude: 21.01 },
    mapsUrl: "https://www.google.com/maps/place/Example",
    identifiers: [
      { type: "cid", value: "18446744073709551615" },
      { type: "place_id", value: "ChIJExampleNorth" },
    ],
  },
};
export const southBranch: LocationSummary = {
  ...northBranch,
  publicId: `biz_${"c".repeat(24)}`,
  version: 1,
  identity: {
    ...northBranch.identity,
    revisionId: "identity-south-v1",
    revision: 1,
    name: "Example Coffee South",
    address: "20 South Street",
    identifiers: [{ type: "place_id", value: "ChIJExampleSouth" }],
    coordinates: null,
    mapsUrl: null,
  },
};
export const archivedBranch: LocationSummary = {
  ...southBranch,
  publicId: `biz_${"d".repeat(24)}`,
  state: "archived",
  identity: { ...southBranch.identity, name: "Archived branch" },
};
export const competitorBranch: LocationSummary = {
  ...southBranch,
  publicId: `biz_${"e".repeat(24)}`,
  role: "competitor",
  identity: { ...southBranch.identity, name: "Other Coffee" },
};
export const unassigned: AssignmentSummary = {
  scope: { kind: "keyword", id: `kw_${"f".repeat(24)}` },
  revision: 0,
  target: null,
  targetAvailable: true,
};
export const weakCandidate: MatchSummary = {
  locationId: northBranch.publicId,
  identityRevisionId: northBranch.identity.revisionId,
  observationRunId: "retained-run-1",
  itemId: "retained-item-7",
  decisionId: "decision-1",
  decisionRevision: 1,
  matcherVersion: "business-match-maps-v1",
  source: "automatic",
  recordedAt: "2026-10-10T10:11:15Z",
  status: "candidate",
  reason: "weak_name_and_domain",
  matchedBy: "name_and_domain",
  promotion: "unknown",
  surface: "maps",
  observedAt: "2026-10-10T10:11:12Z",
  sourceOrdinal: 7,
  rankScale: null,
  originalOrdinals: { page: 2, block: 3, slot: 4, absolute: 24 },
  locationName: northBranch.identity.name,
  locationAddress: northBranch.identity.address,
  itemName: "Example Coffee",
  itemDomain: "example.test",
};
/** Synthetic, deliberately small fixture dictionary; no production locale registration. */
export const businessFixtureMessages: Record<string, string> = {
  locations: "Business locations",
  locationsHelp:
    "Branches keep separate identities even when they share a website. Selecting a branch here does not assign a subject.",
  locationVisibility: "Show locations",
  noLocations: "No locations in this state.",
  readOnly: "You can view these locations. Editing is unavailable.",
  createLocation: "Add business location",
  editIdentity: "Edit identity",
  archive: "Archive",
  restore: "Restore",
  identityRevision: "Identity revision {revision}",
  identityVersionHelp:
    "Saving creates a new identity revision. Historical observations stay unchanged.",
  identityHelp:
    "Keep CID and Place ID as text. A website is a weak signal, not a branch identifier. Maps URLs are not fetched.",
  save: "Save identity",
  cancel: "Cancel",
  saving: "Saving…",
  saved: "Saved.",
  conflict: "The save conflicted. Review current data before continuing; your draft is retained.",
  saveError: "Saving failed. Your draft is retained; try again.",
  selectionChanged:
    "The selected resource changed. Close this editor and open the current selection.",
  currentUnavailable:
    "Current data is unavailable. Request an authorized refresh before reviewing the conflict.",
  reviewCurrent: "Review current data",
  reviewChangedFields:
    "Compare current values with your draft. Keeping changes also refreshes untouched fields.",
  current: "Current",
  yourDraft: "Your draft",
  notProvided: "Not provided",
  keepChangedFields: "Keep my changed fields",
  useCurrent: "Use current values",
  editConflictingIdentity: "Review and edit conflicting identity",
  unavailableBranch: "Unavailable branch",
  archiveHelp:
    "Archiving preserves identity and match history. Archived subjects become unavailable; restoring rechecks active identifier claims.",
  archiveConfirmation: "I reviewed the effect on assigned subjects.",
  currentState: "Current state: {state}; version {version}.",
  reviewState: "Use reviewed state version",
  confirmAction: "Confirm state change",
  assignSubject: "Assign local subject",
  assignmentHelp:
    "Choose an active subject branch and its current identity revision explicitly for this keyword or market. No branch is selected automatically.",
  staleAssignment:
    "This subject identity is archived or no longer current. Select an eligible branch revision or clear the assignment.",
  subject: "Subject branch",
  noSubject: "No assigned subject",
  saveSubject: "Save subject assignment",
  currentAssignment: "Current subject: {name}; assignment revision {revision}.",
  reviewAssignmentKeepChoice: "Use reviewed assignment revision and keep my choice",
  reviewCandidate: "Review candidate",
  candidateBranch: "Branch: {name}",
  candidateItem: "Observed business",
  candidateDomain: "Observed website",
  surface: "Google result surface",
  matchStatus: "Match state",
  matchReason: "Match reason",
  observedAt: "Observed at",
  promotion: "Promotion evidence",
  sourceSlot: "Original slot",
  sourcePage: "Original page",
  sourceOrdinal: "Original item ordinal",
  confirmationBlocked:
    "This item cannot be manually confirmed as a weak candidate. Hard conflicts and missing review details remain unresolved.",
  reviewOnlyThisItem:
    "Confirmation applies only to this retained item. It never confirms future results or turns unknown/promoted items into organic results.",
  reviewAction: "Review action",
  confirmCandidate: "Confirm this candidate",
  rejectCandidate: "Reject this item",
  candidateConfirmation: "I reviewed this branch and this specific observed item.",
  saveReview: "Save item review",
  candidateConflictHelp:
    "The decision or identity changed. Refresh or rematch retained evidence, then review the new decision.",
  reviewLatestDecision: "Review latest decision",
  rematch: "Rematch retained results",
  rematchHelp:
    "Re-evaluate only the selected retained observation and exact current decision heads. This does not send a provider request or modify previous decisions.",
  missingRetainedEvidence: "Required retained evidence is unavailable. Rematching is blocked.",
  rematchConfirmation: "I reviewed the selected retained observation and decision heads.",
  confirmRematch: "Rematch retained observation",
  "fields.name": "Branch name",
  "fields.address": "Address",
  "fields.domain": "Website domain",
  "fields.cid": "Google CID (text)",
  "fields.placeId": "Google Place ID (text)",
  "fields.mapsUrl": "Google Maps URL",
  "fields.latitude": "Latitude",
  "fields.longitude": "Longitude",
  "fields.reason": "Reason",
  "fields.role": "Business purpose",
  "roles.subject": "Subject",
  "roles.competitor": "Competitor",
  "states.active": "Active",
  "states.archived": "Archived",
  "surfaces.web_serp": "Google web results",
  "surfaces.maps": "Google Maps",
  "surfaces.local_finder": "Google Local Finder",
  "matchStates.confirmed": "Confirmed",
  "matchStates.candidate": "Candidate",
  "matchStates.rejected": "Rejected",
  "matchStates.unresolved": "Unresolved",
  "promotions.organic": "Organic",
  "promotions.promoted": "Promoted",
  "promotions.unknown": "Unknown",
  "validation.name": "Enter a valid branch name.",
  "validation.address": "Use at most 500 address characters.",
  "validation.domain": "Enter a valid website domain.",
  "validation.cid": "Enter CID as digits in text; never a numeric conversion.",
  "validation.placeId": "Enter a valid opaque Place ID without whitespace.",
  "validation.mapsUrl": "Use a supported HTTPS Google Maps URL without credentials.",
  "validation.coordinates":
    "Enter both finite coordinates: latitude −90 to 90, longitude −180 to 180.",
  "validation.reason": "Enter a reason of 1–500 characters.",
  "validation.confirmed": "Review and confirm this action.",
  "validation.noChange": "Change an identity field before saving a revision.",
  "reasons.exact_identifier": "Equal stable identifier",
  "reasons.stable_identifier_conflict": "Conflicting stable identifier",
  "reasons.contradictory_identifiers": "Contradictory identifiers",
  "reasons.ambiguous_exact_items": "Multiple exact items",
  "reasons.ambiguous_registry_identity": "Multiple matching branches",
  "reasons.invalid_identifier": "Malformed identifier",
  "reasons.unsafe_numeric_identifier": "Unsafe numeric identifier",
  "reasons.invalid_ordinals": "Invalid original positions",
  "reasons.duplicate_observation_identity": "Duplicate observation identity",
  "reasons.weak_name": "Similar name",
  "reasons.weak_domain": "Shared website",
  "reasons.weak_name_and_domain": "Similar name and shared website",
  "reasons.insufficient_evidence": "Insufficient evidence",
  "reasons.manually_confirmed_item": "This item was manually confirmed",
  "reasons.manually_rejected_item": "This item was manually rejected",
};
const flatFixtureMessages = Object.fromEntries(
  Object.entries(businessFixtureMessages).filter(([key]) => !key.includes(".")),
);
function fixtureGroup(prefix: string) {
  return Object.fromEntries(
    Object.entries(businessFixtureMessages)
      .filter(([key]) => key.startsWith(`${prefix}.`))
      .map(([key, value]) => [key.slice(prefix.length + 1), value]),
  );
}
const productionShape = sharedMessages.shared.businessLocations;
export const businessFixtureTranslate: BusinessTranslator = createTranslator({
  locale: "en",
  messages: {
    ...productionShape,
    ...flatFixtureMessages,
    fields: { ...productionShape.fields, ...fixtureGroup("fields") },
    roles: { ...productionShape.roles, ...fixtureGroup("roles") },
    states: { ...productionShape.states, ...fixtureGroup("states") },
    surfaces: { ...productionShape.surfaces, ...fixtureGroup("surfaces") },
    matchStates: { ...productionShape.matchStates, ...fixtureGroup("matchStates") },
    promotions: { ...productionShape.promotions, ...fixtureGroup("promotions") },
    validation: { ...productionShape.validation, ...fixtureGroup("validation") },
    reasons: { ...productionShape.reasons, ...fixtureGroup("reasons") },
  },
});
