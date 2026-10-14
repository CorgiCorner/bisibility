import type { IdentitySnapshot } from "@/lib/business-locations/dto";
import { identifier } from "@/lib/business-locations/test-fixtures";
import { describe, expect, it, vi } from "vitest";
import { userIdentityPatch } from "./location-repository";
import { identityPatchSchema } from "./schema";

vi.mock("server-only", () => ({}));

const now = "2026-10-13T10:00:00.000Z";
const oldCid = identifier("cid", "18446744073709551615");
const oldPlace = {
  ...identifier("place_id", "ChIJExact"),
  provenance: {
    source: "maps_url" as const,
    referenceId: null,
    recordedAt: oldCid.provenance.recordedAt,
  },
};
const changedGroup = identityPatchSchema.parse({
  identifiers: [
    { namespace: "google_business", engine: "google", type: "cid", value: "12345678901234567890" },
    { namespace: "google_business", engine: "google", type: "place_id", value: oldPlace.value },
  ],
});

describe("current identity provenance in an adjacent identifier edit", () => {
  it("retains the unchanged Maps-derived Place ID while the changed CID gets fresh user provenance", () => {
    const current: IdentitySnapshot = { name: "Synthetic", identifiers: [oldCid, oldPlace] };
    const patch = userIdentityPatch(changedGroup, now, current.identifiers);
    expect(patch.identifiers).toEqual([
      {
        namespace: "google_business",
        engine: "google",
        type: "cid",
        value: "12345678901234567890",
        provenance: { source: "user", referenceId: null, recordedAt: now },
      },
      oldPlace,
    ]);
    expect(current.identifiers).toEqual([oldCid, oldPlace]);
  });

  it("retains an unchanged observation reference and original recording time", () => {
    const retained = {
      ...oldPlace,
      provenance: {
        source: "retained_observation" as const,
        referenceId: "item_original",
        recordedAt: oldCid.provenance.recordedAt,
      },
    };
    const patch = userIdentityPatch(changedGroup, now, [oldCid, retained]);
    expect(patch.identifiers?.find((id) => id.type === "place_id")).toEqual(retained);
  });

  it("rejects client provenance instead of trusting a submitted unchanged identifier", () => {
    expect(identityPatchSchema.safeParse({ identifiers: [oldPlace] }).success).toBe(false);
    expect(
      identityPatchSchema.safeParse({
        identifiers: [
          { ...oldPlace, provenance: { source: "user", referenceId: null, recordedAt: now } },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps omitted and removed IDs distinct and treats a new value as user input", () => {
    expect(userIdentityPatch({ name: "Renamed" }, now, [oldPlace])).toEqual({ name: "Renamed" });
    expect(userIdentityPatch({ identifiers: [] }, now, [oldPlace])).toEqual({ identifiers: [] });
    const patch = userIdentityPatch(changedGroup, now, []);
    expect(
      patch.identifiers?.every(
        (id) => id.provenance.source === "user" && id.provenance.recordedAt === now,
      ),
    ).toBe(true);
  });
});
