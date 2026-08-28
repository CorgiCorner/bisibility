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
  languageLabel?: string;
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
  languageLabel?: string;
};

/**
 * Throws when `locationRef` is missing. `Keyword.locationId` is NOT NULL and
 * its `locationRef` relation is required in Prisma, so a missing relation means
 * the caller omitted `locationRef` from its Prisma `select`, not that the
 * keyword has no location.
 */
export function locationView(row: { locationRef: LocationRelation }): KeywordLocation {
  const ref = row.locationRef;
  if (!ref) {
    throw new Error("Keyword row is missing its required locationRef relation.");
  }
  return {
    canonicalKey: ref.canonicalKey,
    cityName: ref.cityName,
    countryCode: ref.countryCode,
    displayName: ref.displayName,
    gl: ref.gl,
    hl: ref.hl,
    id: ref.canonicalKey,
    kind: ref.kind,
    languageLabel: ref.languageLabel,
  };
}
