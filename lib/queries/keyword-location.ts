// Structured, vendor-neutral location surfaced from the keyword `locationRef`
// relation (design §6). Split out of keywords.ts to keep that query module under
// the line cap. `id` mirrors the canonical key for stable client-side dedup;
// `displayName` is the human label; `kind`
// distinguishes country vs city; `gl`/`hl` drive the live-SERP link.

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

type LocationRelation = {
  id: string;
  displayName: string;
  canonicalKey: string;
  countryCode: string;
  cityName: string | null;
  kind: KeywordLocation["kind"];
  gl: string;
  hl: string;
};

/**
 * Fall back to the legacy location string when the joined relation is missing.
 */
export function locationView(row: {
  location: string;
  locationRef?: LocationRelation | null;
}): KeywordLocation {
  const ref = row.locationRef;
  if (ref) {
    return {
      canonicalKey: ref.canonicalKey,
      cityName: ref.cityName,
      countryCode: ref.countryCode,
      displayName: ref.displayName,
      gl: ref.gl,
      hl: ref.hl,
      id: ref.canonicalKey,
      kind: ref.kind,
    };
  }
  return {
    canonicalKey: row.location,
    cityName: null,
    countryCode: "",
    displayName: row.location,
    gl: "us",
    hl: "en",
    id: row.location,
    kind: "country",
  };
}
