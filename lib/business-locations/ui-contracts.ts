import type { CoreMessages } from "@/i18n/core-messages.generated";
import type {
  assignLocationSchema,
  createLocationSchema,
  rematchLocationSchema,
  reviewMatchSchema,
  reviseLocationSchema,
  stateLocationSchema,
} from "@/lib/business-location-store/schema";
import type {
  BusinessLocationDto,
  EntityMatch,
  MatchReason,
  OriginalOrdinals,
} from "@/lib/business-locations/dto";
import type { _Translator } from "next-intl";
import type { z } from "zod";

export type CreateLocationCommand = z.input<typeof createLocationSchema>;
export type ReviseLocationCommand = z.input<typeof reviseLocationSchema>;
export type StateLocationCommand = z.input<typeof stateLocationSchema>;
export type AssignLocationCommand = z.input<typeof assignLocationSchema>;
export type ReviewMatchCommand = z.input<typeof reviewMatchSchema>;
export type RematchLocationCommand = z.input<typeof rematchLocationSchema>;
export type IdentitySummary = Readonly<{
  revisionId: string;
  revision: number;
  name: string;
  address: string | null;
  domain: string | null;
  coordinates: Readonly<{ latitude: number; longitude: number }> | null;
  mapsUrl: string | null;
  identifiers: readonly Readonly<{ type: "cid" | "place_id"; value: string }>[];
}>;
export type IdentityHistorySummary = Readonly<{
  identity: IdentitySummary;
  effectiveFrom: string;
  reason: string;
}>;
/** Only public location ID and required opaque revision refs, never actors or raw provenance. */
export type LocationSummary = Readonly<{
  publicId: string;
  version: number;
  role: BusinessLocationDto["role"];
  state: BusinessLocationDto["state"];
  identity: IdentitySummary;
}>;
export type AssignmentSummary = Readonly<{
  scope: AssignLocationCommand["scope"];
  revision: number;
  target: AssignLocationCommand["target"];
  targetAvailable: boolean;
}>;
export type AssignmentScopeChoice = Readonly<{
  scope: AssignLocationCommand["scope"];
  name: string;
  location: string;
  device: "desktop" | "mobile" | null;
}>;
export type MatchSummary = Readonly<{
  locationId: string;
  identityRevisionId: string;
  observationRunId: string;
  itemId: string;
  decisionId: string;
  decisionRevision: number;
  matcherVersion: string;
  source: EntityMatch["source"];
  recordedAt: string;
  status: EntityMatch["status"];
  reason: MatchReason;
  matchedBy: EntityMatch["matchedBy"];
  promotion: EntityMatch["promotion"];
  surface: "web_serp" | "maps" | "local_finder";
  observedAt: string;
  originalOrdinals: OriginalOrdinals;
  sourceOrdinal: number | null;
  rankScale: string | null;
  locationName: string | null;
  locationAddress: string | null;
  itemName: string | null;
  itemDomain: string | null;
}>;
export type BusinessCommandResult<T> =
  | { kind: "saved"; value: T }
  | {
      kind: "conflict";
      current: T | null;
      reason?:
        | "revision_conflict"
        | "state_conflict"
        | "idempotency_conflict"
        | "review_cursor_conflict";
    }
  | { kind: "identifier_claimed" }
  | { kind: "identity_error"; reason: "maps_identifier_conflict" | "invalid_maps_identifier" }
  | { kind: "error" };
export type BusinessCommandPort<C, T> = (command: C) => Promise<BusinessCommandResult<T>>;
export type BusinessTranslator = _Translator<
  Pick<CoreMessages, "shared">,
  "shared.businessLocations"
>;
export type BusinessReadPermissions = Readonly<{ canRead: boolean; canWrite: boolean }>;
export type BusinessObservationChoice = Readonly<{
  id: string;
  keyword: string | null;
  surface: "web_serp" | "maps" | "local_finder";
  recordedAt: string;
}>;
export type BusinessReviewContext = Readonly<{
  observationRunId: string;
  identityRevisionId: string;
  decisions: readonly MatchSummary[];
  expectedDecisions: readonly { itemId: string; expectedRevision: number }[];
  evidenceAvailable: boolean;
  includedCount: number;
  eligibleTotal: number;
  watermark: string;
  cursor: string;
  nextCursor: string | null;
  previousCursor: string | null;
  offset: number;
}>;
