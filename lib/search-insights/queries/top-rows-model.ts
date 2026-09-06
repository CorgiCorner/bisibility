export type SearchInsightsQueryRow = {
  clicks: number;
  ctr: number;
  impressions: number;
  position: number;
  query: string;
};

export type SearchInsightsPageRow = {
  clicks: number;
  ctr: number;
  engagementRate: number | null;
  impressions: number;
  keyEvents: number | null;
  /** Pathname and search of the stored URL: the part that tells two pages apart. */
  path: string;
  position: number;
  /** A landing path with no second-source match is deliberately not a zero. */
  sessions: number | null;
  url: string;
};

export type SearchInsightsRows<TRow> = {
  rows: readonly TRow[];
  total: number;
};

export type AggregatedRow = {
  clicks: bigint | number;
  impressions: bigint | number;
  positionWeight: number;
  total: bigint | number;
};

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function metrics(row: AggregatedRow) {
  const clicks = Number(row.clicks);
  const impressions = Number(row.impressions);
  return {
    clicks,
    ctr: ratio(clicks, impressions),
    impressions,
    position: ratio(Number(row.positionWeight), impressions),
  };
}

// One reading of the stored value: a page row is a web address or it is not, and the path and
// the link both depend on the answer.
function webUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The origin is the same for every row of a property, so it buys no information in a narrow
 * column; the path and its query string are what distinguish two pages. Anything that is not a
 * web address - an app deep link, a value the provider invented - is shown exactly as stored
 * rather than reduced to an empty path.
 */
export function pagePath(url: string) {
  const parsed = webUrl(url);
  return parsed ? `${parsed.pathname}${parsed.search}` : url;
}

/**
 * The address a page row may be opened at, or nothing. The value is whatever the provider
 * stored, so anything that is not a web address gets no link rather than a scheme the module
 * never meant to hand a browser.
 */
export function pageHref(url: string) {
  return webUrl(url) ? url : null;
}

export function queryRows(
  rows: readonly (AggregatedRow & { query: string })[],
): SearchInsightsRows<SearchInsightsQueryRow> {
  return {
    rows: rows.map((row) => ({ ...metrics(row), query: row.query })),
    total: Number(rows.at(0)?.total ?? 0),
  };
}

export function pageRows(
  rows: readonly (AggregatedRow & { page: string })[],
): SearchInsightsRows<SearchInsightsPageRow> {
  return {
    rows: rows.map((row) => ({
      ...metrics(row),
      engagementRate: null,
      keyEvents: null,
      path: pagePath(row.page),
      sessions: null,
      url: row.page,
    })),
    total: Number(rows.at(0)?.total ?? 0),
  };
}
