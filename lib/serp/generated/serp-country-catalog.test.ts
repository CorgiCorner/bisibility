import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveSerpLanguage } from "../language-catalog";
import { serpCountryCatalog } from "./serp-country-catalog";

describe("generated country catalog", () => {
  it("reproduces the committed code-keyed catalog with validated language labels", () => {
    const countries = JSON.parse(
      readFileSync("scripts/generate/sources/markets/countries.json", "utf8"),
    ) as Array<{
      aliases: string[];
      countryCode: string;
      displayName: string;
      languageCode: string;
    }>;
    expect(serpCountryCatalog).toEqual(
      countries
        .map((country) => ({
          ...country,
          languageLabel: resolveSerpLanguage(country.languageCode)?.label,
        }))
        .sort((a, b) => a.countryCode.localeCompare(b.countryCode)),
    );
  });

  it("is sorted by country code with no duplicates", () => {
    const codes = serpCountryCatalog.map((entry) => entry.countryCode);

    expect(codes).toEqual([...new Set(codes)].sort((left, right) => left.localeCompare(right)));
  });
});
