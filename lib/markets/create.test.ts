import { describe, expect, it } from "vitest";
import { MarketPasteValidationError, newMarketCreateSchema, parseNewMarketPaste } from "./create";

const projectId = `prj_${"a".repeat(24)}`;
const scheduleId = `sch_${"c".repeat(24)}`;
const sourceMarketId = `pmkt_${"b".repeat(24)}`;

function valid(overrides: Record<string, unknown> = {}) {
  return {
    canonicalKey: "ES",
    countryCode: "ES",
    devices: ["desktop"],
    kind: "country",
    languageCode: "es",
    method: { kind: "empty" },
    name: "Spain search",
    projectId,
    ...overrides,
  };
}

describe("new market input", () => {
  it("selects the location by canonical key and kind, never by a database id", () => {
    expect(newMarketCreateSchema.parse(valid())).toMatchObject({
      canonicalKey: "ES",
      kind: "country",
    });
    expect(
      newMarketCreateSchema.parse(
        valid({ canonicalKey: " ES/Andalusia/Malaga@en ", kind: "city" }),
      ),
    ).toMatchObject({ canonicalKey: "ES/Andalusia/Malaga@en", kind: "city" });

    expect(() => newMarketCreateSchema.parse(valid({ canonicalKey: "" }))).toThrow();
    expect(() => newMarketCreateSchema.parse(valid({ kind: "planet" }))).toThrow();
    const { kind: _kind, ...withoutKind } = valid();
    expect(() => newMarketCreateSchema.parse(withoutKind)).toThrow();
    expect(() => newMarketCreateSchema.parse(valid({ locationId: "loc_1" }))).toThrow();
  });

  it("accepts an optional bounded name with a canonical location, devices, and method", () => {
    expect(() =>
      newMarketCreateSchema.parse({
        countryCode: "ES",
        devices: [],
        languageCode: "es",
        canonicalKey: "",
        name: "   ",
        projectId,
      }),
    ).toThrow();

    const { name: _name, ...withoutName } = valid();
    expect(newMarketCreateSchema.parse(withoutName)).toMatchObject({ canonicalKey: "ES" });
    expect(newMarketCreateSchema.parse(valid({ name: "   " }))).toMatchObject({
      canonicalKey: "ES",
    });
    expect(() => newMarketCreateSchema.parse(valid({ name: "x".repeat(121) }))).toThrow();
  });

  it("rejects a missing or malformed copy source before a transaction starts", () => {
    expect(() =>
      newMarketCreateSchema.parse(valid({ method: { kind: "copy", sourceMarketId: "" } })),
    ).toThrow();

    expect(() =>
      newMarketCreateSchema.parse(
        valid({ method: { kind: "copy", sourceMarketId: "pmkt_invalid" } }),
      ),
    ).toThrow();

    expect(
      newMarketCreateSchema.parse(
        valid({
          devices: ["desktop", "mobile"],
          method: { kind: "copy", sourceMarketId },
          schedule: { kind: "existing", scheduleId },
        }),
      ),
    ).toMatchObject({ method: { sourceMarketId } });
  });

  it.each([
    { kind: "copy", sourceMarketId },
    { kind: "paste", text: "rank tracker" },
  ])("accepts explicit Manual for $kind while keeping schedule selection validated", (method) => {
    expect(
      newMarketCreateSchema.parse(valid({ method, schedule: { kind: "manual" } })),
    ).toMatchObject({ schedule: { kind: "manual" } });
    expect(() => newMarketCreateSchema.parse(valid({ method, schedule: null }))).toThrow();
    expect(() =>
      newMarketCreateSchema.parse(valid({ method, schedule: { kind: "manual", scheduleId } })),
    ).toThrow();
    expect(() => newMarketCreateSchema.parse(valid({ schedule: { kind: "manual" } }))).toThrow();
  });

  it("normalizes valid paste rows and refuses malformed or normalized duplicate rows", () => {
    expect(
      parseNewMarketPaste(" SEO tool | https://example.com/tools \nRank tracker | /rank"),
    ).toEqual([
      { text: "SEO tool", targetUrl: "https://example.com/tools" },
      { text: "Rank tracker", targetUrl: "/rank" },
    ]);

    expect(() => parseNewMarketPaste("SEO tool\n seo   tool ")).toThrow(MarketPasteValidationError);
    expect(() => parseNewMarketPaste("SEO tool | //example.com")).toThrow(
      MarketPasteValidationError,
    );
    expect(() => parseNewMarketPaste("\n \n")).toThrow(MarketPasteValidationError);
  });
});
