import type { StoredBusinessLocation } from "@/lib/business-location-store/location-repository";
import type { StoredEntityMatch } from "@/lib/business-location-store/match-repository";
import { describe, expect, it } from "vitest";
import { isReviewableCandidate, locationSummary, matchSummary } from "./presentation";
import { northBranch, weakCandidate } from "./test-fixtures";

describe("authorized business DTO minimization", () => {
  it("picks only leaf-required fields; no actor, project internal ID, provenance, reason or extra nested fields", () => {
    const stored = {
      id: "private-entity",
      projectId: "private-project",
      publicId: northBranch.publicId,
      version: 4,
      role: "subject",
      state: "active",
      currentRevision: {
        id: "identity-north-v3",
        revision: 3,
        actorId: "private-actor",
        reason: "private-audit",
        snapshot: {
          ...northBranch.identity,
          coordinates: { latitude: 52.23, longitude: 21.01, raw: "private-coordinate" },
          identifiers: northBranch.identity.identifiers.map((id) => ({
            ...id,
            namespace: "google_business",
            engine: "google",
            provenance: {
              source: "retained_observation",
              referenceId: "private-source",
              recordedAt: "2026-10-10T10:11:12Z",
            },
          })),
        },
      },
    } as unknown as StoredBusinessLocation;
    const dto = locationSummary(stored);
    expect(dto).toEqual(northBranch);
    expect(JSON.stringify(dto)).not.toContain("private-");
  });
  it.each(["maps", "local_finder"] as const)(
    "retains authorized %s surface and original ordinals without leaking provider/source",
    (surface) => {
      const stored = {
        ...weakCandidate,
        id: weakCandidate.decisionId,
        entityId: "private-entity",
        projectId: "private-project",
        confirmedBy: "private-actor",
        reviewReason: "private-audit",
        observationSource: {
          provider: "private-provider",
          adapterVersion: "v1",
          normalizationVersion: null,
          originalObservedAt: weakCandidate.observedAt,
          rankScale: null,
          sourceBlockId: "private-block",
          sourceOrdinal: 7,
        },
      } as unknown as StoredEntityMatch;
      const dto = matchSummary(stored, northBranch.publicId, surface, {
        locationName: northBranch.identity.name,
        locationAddress: northBranch.identity.address,
        itemName: weakCandidate.itemName,
        itemDomain: weakCandidate.itemDomain,
      });
      expect(dto).toEqual({ ...weakCandidate, surface });
      expect(JSON.stringify(dto)).not.toContain("private-");
    },
  );
  it.each([
    "stable_identifier_conflict",
    "ambiguous_exact_items",
    "unsafe_numeric_identifier",
    "insufficient_evidence",
  ] as const)("never exposes %s as a manually confirmable weak candidate", (reason) => {
    expect(isReviewableCandidate({ ...weakCandidate, reason })).toBe(false);
  });
  it("allows a weak candidate review without claiming unknown promotion is organic", () => {
    expect(isReviewableCandidate(weakCandidate)).toBe(true);
    expect(weakCandidate.promotion).toBe("unknown");
  });
});
