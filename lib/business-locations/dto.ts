export const businessIdentityNormalizerVersion = "business-identity-v2";
export const businessMatcherVersion = "business-match-v1";
export const mapsBusinessMatcherVersion = "business-match-maps-v1";

export type BusinessIdentifier = Readonly<{
  namespace: "google_business";
  engine: "google";
  type: "cid" | "place_id";
  value: string;
  provenance: Readonly<{
    source: "user" | "retained_observation" | "maps_url";
    referenceId: string | null;
    recordedAt: string;
  }>;
}>;

export type IdentitySnapshot = Readonly<{
  name: string;
  address?: string | null;
  domain?: string | null;
  coordinates?: Readonly<{ latitude: number; longitude: number }> | null;
  mapsUrl?: string | null;
  identifiers: readonly BusinessIdentifier[];
}>;

export type IdentityRevision = Readonly<{
  id: string;
  entityId: string;
  projectId: string;
  revision: number;
  previousRevisionId: string | null;
  effectiveFrom: string;
  normalizerVersion: string;
  actorId: string | null;
  reason: string;
  snapshot: IdentitySnapshot;
}>;

export type BusinessLocationDto = Readonly<{
  id: string;
  projectId: string;
  role: "subject" | "competitor";
  state: "active" | "archived";
  currentRevision: IdentityRevision;
}>;

export type OriginalOrdinals = Readonly<{
  page: number | null;
  block: number | null;
  slot: number | null;
  absolute: number | null;
  /** Native Maps group; never a fabricated pack slot or absolute position. */
  group?: number | null;
  scale?: "maps_organic" | null;
}>;

export type BusinessObservationItem = Readonly<{
  projectId: string;
  observationRunId: string;
  itemId: string;
  observedAt: string;
  surface: "web_serp" | "maps" | "local_finder";
  resultKind: "local_pack" | "map_listing" | "listing" | "organic_result" | "unknown";
  promotion: "organic" | "promoted" | "unknown";
  originalOrdinals: OriginalOrdinals;
  identifiers: readonly Readonly<{
    namespace: string;
    engine: string;
    type: "cid" | "place_id";
    value: unknown;
  }>[];
  identityIssue?: "invalid_identifier" | "unsafe_numeric_identifier" | "contradictory_identifiers";
  name: string | null;
  domain: string | null;
}>;

export type MatchReason =
  | "exact_identifier"
  | "stable_identifier_conflict"
  | "contradictory_identifiers"
  | "ambiguous_exact_items"
  | "ambiguous_registry_identity"
  | "invalid_identifier"
  | "unsafe_numeric_identifier"
  | "invalid_ordinals"
  | "duplicate_observation_identity"
  | "weak_name"
  | "weak_domain"
  | "weak_name_and_domain"
  | "insufficient_evidence"
  | "manually_confirmed_item"
  | "manually_rejected_item";

export type MatchEvaluation = Readonly<{
  projectId: string;
  entityId: string;
  identityRevisionId: string;
  observationRunId: string;
  itemId: string;
  observedAt: string;
  matcherVersion: string;
  status: "confirmed" | "candidate" | "rejected" | "unresolved";
  matchedBy: "stable_id" | "name" | "domain" | "name_and_domain" | "manual" | null;
  reason: MatchReason;
  evidenceIdentifierTypes: readonly BusinessIdentifier["type"][];
  originalOrdinals: OriginalOrdinals;
  promotion: BusinessObservationItem["promotion"];
  localResult: boolean;
  organicEligible: boolean;
}>;

export type EntityMatch = MatchEvaluation &
  Readonly<{
    id: string;
    decisionRevision: number;
    previousDecisionId: string | null;
    source: "automatic" | "manual" | "rematch";
    confirmedBy: string | null;
    recordedAt: string;
    reviewReason: string | null;
  }>;

/** Supplied by the authenticated transaction adapter, not by request JSON. */
export type TrustedWriteContext = Readonly<{
  actorId: string;
  projectId: string;
  canWrite: boolean;
  writeMode: "editable" | "read_only";
}>;

export type AuditIntent = Readonly<{
  action:
    | "business_location.identity_revision"
    | "business_location.match_recorded"
    | "business_location.match_confirmed"
    | "business_location.match_rejected"
    | "business_location.rematched";
  projectId: string;
  actorId: string;
  entityId: string;
  revisionId: string;
  previousId: string | null;
  idempotencyKey: string;
  recordedAt: string;
}>;
