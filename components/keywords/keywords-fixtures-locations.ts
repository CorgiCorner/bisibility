// Demo location set for keyword fixtures (split out to keep keywords-fixtures.ts
// under the line cap). Mostly country-level with a couple of city rows so the
// lens/compare stories and the location column exercise both granularities.

export type KeywordLocation = {
  id: string;
  displayName: string;
  canonicalKey: string;
  countryCode: string;
  cityName: string | null;
  kind: "country" | "region" | "city";
  gl: string;
  hl: string;
};

const fixtureLocations: KeywordLocation[] = [
  {
    canonicalKey: "US",
    cityName: null,
    countryCode: "US",
    displayName: "United States",
    gl: "us",
    hl: "en",
    id: "loc_us",
    kind: "country",
  },
  {
    canonicalKey: "US/Texas/Austin",
    cityName: "Austin",
    countryCode: "US",
    displayName: "Austin, Texas, United States",
    gl: "us",
    hl: "en",
    id: "loc_us_austin",
    kind: "city",
  },
  {
    canonicalKey: "GB",
    cityName: null,
    countryCode: "GB",
    displayName: "United Kingdom",
    gl: "gb",
    hl: "en",
    id: "loc_gb",
    kind: "country",
  },
];

export function fixtureLocation(idNumber: number): KeywordLocation {
  if (idNumber % 7 === 0) {
    return fixtureLocations[1];
  }
  if (idNumber % 5 === 0) {
    return fixtureLocations[2];
  }
  return fixtureLocations[0];
}
