import type { BusinessIdentifier, IdentitySnapshot } from "./dto";
import { IdentityMapsUrlError } from "./identity-errors";
import { identifiersFromMapsUrl } from "./identity-normalization";
import { identitySnapshotSchema } from "./schema";

/** A new write may join explicit URL IDs; reading an old revision never reinterprets it. */
export function identityWithMapsIdentifiers(snapshot: IdentitySnapshot, recordedAt: string) {
  if (!snapshot.mapsUrl) return snapshot;
  let fromUrl: ReturnType<typeof identifiersFromMapsUrl>;
  try {
    fromUrl = identifiersFromMapsUrl(snapshot.mapsUrl);
  } catch (cause) {
    if (
      cause instanceof Error &&
      [
        "Unsupported Maps URL.",
        "Conflicting Maps identifiers.",
        "Invalid Maps identifier.",
      ].includes(cause.message)
    )
      throw new IdentityMapsUrlError("invalid_maps_identifier", cause.message);
    throw cause;
  }
  const identifiers: BusinessIdentifier[] = [...snapshot.identifiers];
  for (const identifier of fromUrl) {
    const existing = identifiers.find((item) => item.type === identifier.type);
    if (existing && existing.value !== identifier.value)
      throw new IdentityMapsUrlError(
        "maps_identifier_conflict",
        "Maps URL identifiers conflict with this identity.",
      );
    if (existing) continue;
    identifiers.push({
      namespace: "google_business",
      engine: "google",
      ...identifier,
      provenance: { source: "maps_url", referenceId: null, recordedAt },
    });
  }
  return identitySnapshotSchema.parse({ ...snapshot, identifiers });
}
