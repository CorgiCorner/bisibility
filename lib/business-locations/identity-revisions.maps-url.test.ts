import { describe, expect, it } from "vitest";
import { planIdentityRevision } from "./identity-revisions";
import { identityRevisionSchema } from "./schema";
import {
  cidA,
  cidB,
  identifier,
  location,
  projectId,
  revision,
  writeContext,
} from "./test-fixtures";

const plan = (patch: Parameters<typeof planIdentityRevision>[0]["patch"], current = revision()) =>
  planIdentityRevision({
    id: "identity-next",
    entityId: current.entityId,
    projectId,
    current,
    expectedRevision: current.revision,
    patch,
    activeLocations: [location(current)],
    context: writeContext,
    effectiveFrom: "2026-10-12T12:00:00.000Z",
    reason: "Reviewed identity",
    idempotencyKey: "identity-command",
  });

describe("writer Maps URL identity normalization", () => {
  it("derives exact opaque URL identifiers and URL provenance in a new version", () => {
    const original = revision(),
      old = { ...original, snapshot: { ...original.snapshot, mapsUrl: null, identifiers: [] } };
    const before = structuredClone(old);
    const next = plan(
      { mapsUrl: `https://www.google.com/maps?cid=${cidA}&query_place_id=ChIJ_Synthetic` },
      old,
    ).revision;
    expect(next.snapshot.identifiers).toEqual([
      {
        ...identifier("cid", cidA),
        provenance: {
          source: "maps_url",
          referenceId: null,
          recordedAt: "2026-10-12T12:00:00.000Z",
        },
      },
      {
        ...identifier("place_id", "ChIJ_Synthetic"),
        provenance: {
          source: "maps_url",
          referenceId: null,
          recordedAt: "2026-10-12T12:00:00.000Z",
        },
      },
    ]);
    expect(next.normalizerVersion).toBe("business-identity-v2");
    expect(old).toEqual(before);
  });
  it("rejects a URL-only change contradicting the retained original CID", () => {
    expect(() => plan({ mapsUrl: `https://www.google.com/maps?cid=${cidB}` })).toThrow(
      "Maps URL identifiers conflict",
    );
  });
  it("rejects explicit PlaceID conflict and contradictory URL queries", () => {
    expect(() =>
      plan({
        identifiers: [identifier("place_id", "ChIJ_Explicit")],
        mapsUrl: "https://www.google.com/maps?query_place_id=ChIJ_URL",
      }),
    ).toThrow("Maps URL identifiers conflict");
    expect(() => plan({ mapsUrl: "https://www.google.com/maps?cid=1&cid=2" })).toThrow(
      "Conflicting Maps identifiers",
    );
  });
  it("accepts an explicit material correction while preserving old immutable IDs", () => {
    const old = revision(),
      before = structuredClone(old);
    expect(
      plan(
        {
          mapsUrl: `https://www.google.com/maps?cid=${cidB}`,
          identifiers: [identifier("cid", cidB)],
        },
        old,
      ).revision.snapshot.identifiers[0].value,
    ).toBe(cidB);
    expect(old).toEqual(before);
  });
  it("reads a retained v1 revision without interpreting or rewriting its URL", () => {
    const original = { ...revision(), normalizerVersion: "business-identity-v1" };
    expect(identityRevisionSchema.parse(original)).toEqual(original);
    expect(plan({ name: "New label" }, original).revision.normalizerVersion).toBe(
      "business-identity-v2",
    );
    expect(original.normalizerVersion).toBe("business-identity-v1");
  });
  it("preserves matching original provenance instead of rewriting it on label edit", () => {
    const old = revision();
    expect(plan({ name: "Renamed" }, old).revision.snapshot.identifiers).toEqual(
      old.snapshot.identifiers,
    );
  });
});
