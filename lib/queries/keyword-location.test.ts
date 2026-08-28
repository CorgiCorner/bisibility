import { describe, expect, it } from "vitest";
import { locationView } from "./keyword-location";
import { keywordLocationRelation } from "./keyword-location-test-fixtures";

describe("locationView", () => {
  it("maps required country and city location relations", () => {
    expect(locationView({ locationRef: keywordLocationRelation })).toMatchObject({
      canonicalKey: "US",
      gl: "us",
      hl: "en",
      kind: "country",
    });
    expect(
      locationView({
        locationRef: {
          ...keywordLocationRelation,
          canonicalKey: "US/Texas/Austin",
          cityName: "Austin",
          displayName: "Austin, Texas, United States",
          kind: "city",
        },
      }),
    ).toMatchObject({ canonicalKey: "US/Texas/Austin", cityName: "Austin", kind: "city" });
  });

  it("throws instead of fabricating a US location for missing relation data", () => {
    expect(() => locationView({ locationRef: null } as never)).toThrow(
      "Keyword row is missing its required locationRef relation.",
    );
  });
});
