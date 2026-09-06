import { describe, expect, it } from "vitest";
import { assertKeywordIdentityUnchanged, KeywordIdentityImmutableError } from "./identity";

const current = {
  device: "desktop",
  locationId: "location_1",
  text: "rank tracker",
};

describe("keyword identity", () => {
  it.each([
    ["text", { text: "seo tracker" }, "rank tracker", "seo tracker"],
    ["locationId", { locationId: "location_2" }, "location_1", "location_2"],
    ["device", { device: "mobile" }, "desktop", "mobile"],
  ] as const)("rejects a changed %s", (field, next, storedValue, attemptedValue) => {
    expect(() => assertKeywordIdentityUnchanged(current, next)).toThrowError(
      expect.objectContaining({
        attemptedValue,
        field,
        storedValue,
      }),
    );
  });

  it("accepts absent, undefined, and identical identity values", () => {
    expect(() => assertKeywordIdentityUnchanged(current, {})).not.toThrow();
    expect(() =>
      assertKeywordIdentityUnchanged(current, {
        device: undefined,
        locationId: undefined,
        text: undefined,
      }),
    ).not.toThrow();
    expect(() => assertKeywordIdentityUnchanged(current, current)).not.toThrow();
  });

  it("uses a conflict error that explains how to preserve keyword history", () => {
    const error = new KeywordIdentityImmutableError("text", "rank tracker", "seo tracker");

    expect(error).toMatchObject({
      code: "conflict",
      name: "KeywordIdentityImmutableError",
      status: 409,
    });
    expect(error.message).toContain("different keyword");
    expect(error.message).toContain("archive the old keyword");
  });
});
