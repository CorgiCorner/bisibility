import type {
  BusinessIdentifier,
  BusinessLocationDto,
  BusinessObservationItem,
  IdentityRevision,
  TrustedWriteContext,
} from "./dto";
import { businessIdentityNormalizerVersion } from "./dto";

export const projectId = "project_a",
  observationRunId = "observation_1";
export const recordedAt = "2026-10-01T10:00:00.000Z";
export const cidA = "18446744073709551615",
  cidB = "12345678901234567890";
export const writeContext: TrustedWriteContext = {
  actorId: "editor_1",
  projectId,
  canWrite: true,
  writeMode: "editable",
};

export function identifier(type: "cid" | "place_id", value: string): BusinessIdentifier {
  return {
    namespace: "google_business",
    engine: "google",
    type,
    value,
    provenance: { source: "user", referenceId: null, recordedAt },
  };
}

export function revision(entityId = "entity_a", cid = cidA): IdentityRevision {
  return {
    id: `${entityId}_revision_1`,
    entityId,
    projectId,
    revision: 1,
    previousRevisionId: null,
    effectiveFrom: recordedAt,
    normalizerVersion: businessIdentityNormalizerVersion,
    actorId: "editor_1",
    reason: "Initial branch identity",
    snapshot: {
      name: "Żółw Firma",
      address: "Synthetic branch address",
      domain: "firma.example",
      coordinates: { latitude: 52.2, longitude: 21.0 },
      mapsUrl: `https://www.google.com/maps?cid=${cid}`,
      identifiers: [identifier("cid", cid)],
    },
  };
}

export function location(identity = revision()): BusinessLocationDto {
  return {
    id: identity.entityId,
    projectId: identity.projectId,
    role: "subject",
    state: "active",
    currentRevision: identity,
  };
}

export function item(itemId = "item_a", slot = 3, cid: unknown = cidA): BusinessObservationItem {
  return {
    itemId,
    projectId,
    observationRunId,
    observedAt: recordedAt,
    surface: "web_serp",
    resultKind: "local_pack",
    promotion: "organic",
    originalOrdinals: { page: 2, block: 4, slot, absolute: 17 },
    identifiers:
      cid === null
        ? []
        : [{ namespace: "google_business", engine: "google", type: "cid", value: cid }],
    name: "Żółw Firma",
    domain: "firma.example",
  };
}
