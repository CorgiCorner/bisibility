import { publicIdSchema } from "./openapi-public-id";

export const localText = { type: "string" } as const;
export const localNumber = { type: "number" } as const;
export const localInteger = { type: "integer", minimum: 0 } as const;
export const localDate = { type: "string", format: "date-time" } as const;
export const localBoolean = { type: "boolean" } as const;
export const localNullable = (value: object) => ({ anyOf: [value, { type: "null" }] });
export const localArray = (items: object, maxItems: number) => ({ type: "array", items, maxItems });

/** Select field spelling only. The camel form is the existing Local downloadable JSON contract. */
export function localObjectBuilder(snake: boolean) {
  return (fields: Record<string, object>) => {
    const name = (key: string) =>
      snake ? key.replace(/[A-Z]/g, (value) => `_${value.toLowerCase()}`) : key;
    return {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(fields).map(([key, value]) => [name(key), value]),
      ),
      required: Object.keys(fields).map(name),
    };
  };
}

export function localMonitorPartSchemas(snake = true) {
  const object = localObjectBuilder(snake);
  const target = publicIdSchema("lmt"),
    keyword = publicIdSchema("kw");
  const item = object({
    targetId: target,
    status: localText,
    version: localInteger,
    acceptance: localNullable(localText),
    knownAcceptedTaskCount: localNullable(localInteger),
    collected: localBoolean,
    cancellationRequested: localBoolean,
    financialState: localNullable(localText),
    ownerRetained: localBoolean,
    resolution: localText,
    accountingPending: localNullable(localBoolean),
    reconciliationReason: localNullable(localText),
  });
  const receipt = object({
    id: publicIdSchema("lmr"),
    version: localInteger,
    cancellationRequested: localBoolean,
    expectedCount: localInteger,
    items: localArray(item, 100),
    counts: object({
      items: localInteger,
      complete: localInteger,
      acceptanceUnresolved: localInteger,
      accountingPending: localInteger,
      unavailable: localInteger,
      retainedOwners: localInteger,
    }),
  });
  const point = object({
    id: target,
    keywordId: keyword,
    keyword: localText,
    ordinal: localInteger,
    row: localInteger,
    column: localInteger,
    latitude: { type: "string", pattern: "^-?[0-9]{1,3}\\.[0-9]{7}$" },
    longitude: { type: "string", pattern: "^-?[0-9]{1,3}\\.[0-9]{7}$" },
    surface: localText,
    cutoff: localInteger,
    zoom: localNullable(localNumber),
    language: localText,
    device: localText,
    operatingSystem: localNullable(localText),
    observedAt: localNullable(localDate),
    recordedAt: localNullable(localDate),
    position: localNullable(localNumber),
    observedPosition: localNullable(localNumber),
    evidence: localText,
    reason: localNullable(localText),
    freshness: localText,
    freshnessReason: localNullable(localText),
    identityMatch: localText,
    scopeClass: localText,
    receipt: item,
  });
  const grid = object({
    keywordId: keyword,
    keyword: localText,
    gridRevisionKey: localText,
    identityRevisionId: localText,
    topN: localInteger,
    size: { type: "integer", enum: [1, 3, 5, 7] },
    pointIds: localArray(target, 49),
    expected: localInteger,
    observedRate: localNullable(localNumber),
    observedCoverage: localNullable(localNumber),
    dataCoverage: localNullable(localNumber),
    sampleBounds: localNullable({ type: "array", items: localNumber, minItems: 2, maxItems: 2 }),
    counts: object({
      expected: localInteger,
      measured: localInteger,
      metricEligible: localInteger,
      ranked: localInteger,
      knownAbsent: localInteger,
      unknown: localInteger,
      neverChecked: localInteger,
      failed: localInteger,
      stale: localInteger,
      unsupported: localInteger,
      freshDeterminate: localNullable(localInteger),
      unknownFreshness: localInteger,
      comparable: localInteger,
    }),
    freshness: localText,
    comparison: { type: "string", const: "unavailable" },
    scope: { type: "string", const: "sampled_points" },
  });
  // Optional additive reason; successful homogeneous grids keep the existing shape.
  grid.properties.reason = {
    type: "string",
    enum: ["matcher_version_mixed"],
    description:
      "Ranking aggregate unavailable across matcher versions; point evidence and coverage remain readable.",
  };
  const listing = object({
    id: localText,
    name: localNullable(localText),
    rankGroup: localNullable(localInteger),
    rankAbsolute: localNullable(localInteger),
    promotion: localText,
    observedAt: localNullable(localDate),
    matched: localText,
    cid: localNullable(localText),
    placeId: localNullable(localText),
    sourcePage: localNullable(localInteger),
    sourceBlockId: localNullable(localText),
    sourceOrdinal: localNullable(localInteger),
    rankScale: localNullable(localText),
  });
  return { point, grid, listing, receipt };
}
