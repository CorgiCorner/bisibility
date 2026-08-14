import { countryValueForCode } from "@/components/keywords/location-picker-data";
import { describe, expect, it } from "vitest";
import {
  additionalMarketLanguages,
  marketChoice,
  recommendedMarketLanguages,
} from "./market-picker-model";

function spain() {
  const location = countryValueForCode("ES");
  if (!location) throw new Error("Spain fixture is missing.");
  return location;
}

describe("market picker model", () => {
  it("keeps the default first and CLDR suggestions country scoped", () => {
    expect(recommendedMarketLanguages(spain()).map((language) => language.code)).toEqual([
      "es",
      "ca",
      "gl",
    ]);
    expect(additionalMarketLanguages(spain(), "English").map((language) => language.code)).toEqual([
      "en",
    ]);
  });

  it("builds pair identity and research capability from shared contracts", () => {
    expect(marketChoice(spain(), { code: "es", label: "Spanish" })).toMatchObject({
      canonicalKey: "ES",
      researchAvailable: true,
    });
    expect(marketChoice(spain(), { code: "en", label: "English" })).toMatchObject({
      canonicalKey: "ES@en",
      researchAvailable: false,
    });
  });
});
