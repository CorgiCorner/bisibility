export const feedFacetAxes = ["module", "market", "language", "engine", "severity"] as const;

export type FeedFacetAxis = (typeof feedFacetAxes)[number];
export type FeedFacet = { axis: FeedFacetAxis; value: string };
export type FeedFacetOption = { label: string; value: string };
export type FeedFacetOptions = Partial<Readonly<Record<FeedFacetAxis, readonly FeedFacetOption[]>>>;
export type FeedFacetSearch = URLSearchParams | Record<string, string | string[] | undefined>;
export type ParsedFeedFacets = { facets: FeedFacet[]; rejected: string[] };
export type FeedRowMetadata = {
  engine?: string;
  language?: string;
  market?: { id: string; label: string };
  module?: string;
  severity?: string;
  source?: string;
};

const axisOrder = new Map(feedFacetAxes.map((axis, index) => [axis, index]));

function normalizeValue(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

function optionFor(
  options: FeedFacetOptions,
  axis: FeedFacetAxis,
  value: string,
): FeedFacetOption | undefined {
  return options[axis]?.find((option) => normalizeValue(option.value) === value);
}

function normalizeFacet(facet: FeedFacet, options: FeedFacetOptions): FeedFacet | undefined {
  const value = normalizeValue(facet.value);
  const option = value ? optionFor(options, facet.axis, value) : undefined;
  return option ? { axis: facet.axis, value: normalizeValue(option.value) } : undefined;
}

function compareFacets(left: FeedFacet, right: FeedFacet) {
  const axisDifference = (axisOrder.get(left.axis) ?? 0) - (axisOrder.get(right.axis) ?? 0);
  return axisDifference || left.value.localeCompare(right.value, "en-US");
}

function rawValues(input: FeedFacetSearch, key: string): string[] {
  if (input instanceof URLSearchParams) return input.getAll(key);
  const value = input[key];
  return Array.isArray(value) ? value : value ? [value] : [];
}

function parseToken(token: string): FeedFacet | undefined {
  if (token.includes("%")) return undefined;
  const parts = token.split(":");
  if (parts.length !== 2) return undefined;
  const [axis, rawValue] = parts;
  if (!feedFacetAxes.includes(axis as FeedFacetAxis)) return undefined;
  const value = normalizeValue(rawValue);
  return value ? { axis: axis as FeedFacetAxis, value } : undefined;
}

/** Parses only trusted values supplied by the active project and current feed. */
export function parseFeedFacets(
  input: FeedFacetSearch,
  options: FeedFacetOptions,
): ParsedFeedFacets {
  const facets: FeedFacet[] = [];
  const rejected: string[] = [];

  for (const token of rawValues(input, "f")) {
    const parsed = parseToken(token);
    const normalized = parsed ? normalizeFacet(parsed, options) : undefined;
    if (!normalized) {
      rejected.push(token);
      continue;
    }
    if (
      !facets.some((facet) => facet.axis === normalized.axis && facet.value === normalized.value)
    ) {
      facets.push(normalized);
    }
  }

  return { facets: facets.sort(compareFacets), rejected };
}

export function normalizeFeedFacets(facets: readonly FeedFacet[], options: FeedFacetOptions) {
  const params = new URLSearchParams();
  for (const facet of facets) params.append("f", `${facet.axis}:${facet.value}`);
  return parseFeedFacets(params, options).facets;
}

export function serializeFeedFacets(
  facets: readonly FeedFacet[],
  options: FeedFacetOptions,
): string[] {
  return normalizeFeedFacets(facets, options).map((facet) => `${facet.axis}:${facet.value}`);
}

export function feedFacetValues(facets: readonly FeedFacet[], axis: FeedFacetAxis): string[] {
  return facets.filter((facet) => facet.axis === axis).map((facet) => facet.value);
}

export function feedFacetLabel(facet: FeedFacet, options: FeedFacetOptions): string {
  return optionFor(options, facet.axis, facet.value)?.label ?? facet.value;
}

function toSearchParams(input: FeedFacetSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  const params = new URLSearchParams();
  for (const [key, values] of Object.entries(input)) {
    for (const value of Array.isArray(values) ? values : values ? [values] : []) {
      params.append(key, value);
    }
  }
  return params;
}

function replaceFacets(
  input: FeedFacetSearch,
  current: readonly FeedFacet[],
  next: readonly FeedFacet[],
  options: FeedFacetOptions,
): URLSearchParams {
  const params = toSearchParams(input);
  const currentTokens = serializeFeedFacets(current, options);
  const nextTokens = serializeFeedFacets(next, options);
  const scopeChanged = currentTokens.join("&") !== nextTokens.join("&");
  params.delete("f");
  if (scopeChanged) params.delete("page");
  for (const token of nextTokens) params.append("f", token);
  return params;
}

/** Adds one valid facet while retaining unrelated query state. */
export function addFeedFacet(
  input: FeedFacetSearch,
  facet: FeedFacet,
  options: FeedFacetOptions,
): URLSearchParams {
  const current = parseFeedFacets(input, options).facets;
  return replaceFacets(input, current, [...current, facet], options);
}

/** Removes one facet while retaining unrelated query state. */
export function removeFeedFacet(
  input: FeedFacetSearch,
  facet: FeedFacet,
  options: FeedFacetOptions,
): URLSearchParams {
  const current = parseFeedFacets(input, options).facets;
  const value = normalizeValue(facet.value);
  return replaceFacets(
    input,
    current,
    current.filter(
      (currentFacet) => currentFacet.axis !== facet.axis || currentFacet.value !== value,
    ),
    options,
  );
}
