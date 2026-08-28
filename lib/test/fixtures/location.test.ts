import { describe, expect, it } from "vitest";
import {
  keywordLocation,
  locationSearchWireCandidate,
  locationSuggestion,
  providerLocationSuggestion,
  resolvedLocation,
} from "./location";

describe("location test fixtures", () => {
  it("provides complete fixtures for every location boundary", () => {
    expect(locationSearchWireCandidate().canonical_key).toBe("US");
    expect(locationSuggestion().canonicalKey).toBe("US");
    expect(providerLocationSuggestion().canonicalKey).toBe("US/Texas/Austin");
    expect(resolvedLocation().canonicalKey).toBe("US");
  });

  it("keeps KeywordLocation ids equal to their canonical keys", () => {
    expect(keywordLocation({ canonicalKey: "US/Texas/Austin", id: "loc_austin" })).toMatchObject({
      canonicalKey: "US/Texas/Austin",
      id: "US/Texas/Austin",
    });
  });
});
