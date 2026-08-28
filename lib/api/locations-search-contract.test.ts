import { describe, expect, it } from "vitest";
import {
  CANONICAL_KEY_MAX,
  locationSearchConsumerResponseSchema,
  locationSearchResponseSchema,
  normalizeLocationSearchItem,
} from "./locations-search-contract";

const currentCandidate = {
  canonical_key: "US/Texas/Austin",
  city_name: "Austin",
  country_code: "US",
  display_name: "Austin, Texas, United States",
  hl: "en",
  id: "location:US/Texas/Austin",
  kind: "city" as const,
  language_code: "en",
  language_label: "English",
  region_code: "US-TX",
  region_name: "Texas",
};

describe("location search contract", () => {
  it("accepts current and legacy wire candidates, normalizing a missing id", () => {
    const parsed = locationSearchResponseSchema.parse({
      data: [currentCandidate, { ...currentCandidate, id: undefined }],
    });

    expect(parsed.data.map(normalizeLocationSearchItem)).toEqual([
      currentCandidate,
      { ...currentCandidate, id: currentCandidate.canonical_key },
    ]);
  });

  it("rejects malformed candidates instead of passing them to the UI", () => {
    expect(
      locationSearchResponseSchema.safeParse({
        data: [{ canonical_key: "US", display_name: "United States" }],
      }).success,
    ).toBe(false);
  });

  it("accepts canonical keys at the shared maximum and rejects longer keys", () => {
    const canonicalKey = "a".repeat(CANONICAL_KEY_MAX);
    const candidate = {
      ...currentCandidate,
      canonical_key: canonicalKey,
      id: `location:${canonicalKey}`,
    };

    expect(locationSearchResponseSchema.safeParse({ data: [candidate] }).success).toBe(true);
    expect(locationSearchConsumerResponseSchema.safeParse({ data: [candidate] }).success).toBe(
      true,
    );

    const tooLongCanonicalKey = "a".repeat(CANONICAL_KEY_MAX + 1);
    expect(
      locationSearchResponseSchema.safeParse({
        data: [
          {
            ...candidate,
            canonical_key: tooLongCanonicalKey,
            id: `location:${tooLongCanonicalKey}`,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("allows additive candidate fields for older browser clients", () => {
    expect(
      locationSearchConsumerResponseSchema.parse({
        data: [{ ...currentCandidate, future_provider_field: "supported" }],
      }).data,
    ).toHaveLength(1);
    expect(
      locationSearchResponseSchema.safeParse({
        data: [{ ...currentCandidate, future_provider_field: "supported" }],
      }).success,
    ).toBe(false);
  });
});
