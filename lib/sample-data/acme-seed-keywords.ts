import type { AcmeKeywordFixture } from "./fixture-types.ts";
import { acmeKeywords } from "./fixtures.ts";

const additionalAcmeKeywords = [
  ["seo change monitoring", "features/change-monitoring", [24, 21, 19, 16], ["Product"]],
  ["technical seo dashboard", "features/technical-seo", [18, 17, 14, 12], ["Product"]],
  ["content decay alerts", "features/content-decay", [32, 28, 25, 21], ["Product"]],
  ["search visibility tracker", "features/search-visibility", [14, 12, 10, 8], ["High intent"]],
  ["indexing issue monitor", "docs/indexing", [27, 23, 20, 18], ["Docs"]],
  ["ai visibility tracker", "features/ai-visibility", [41, 35, 31, 26], ["Product"]],
  ["brand monitoring tool", "features/brand-monitoring", [22, 20, 17, 15], ["Product"]],
  ["enterprise seo dashboard", "enterprise", [19, 16, 13, 11], ["High intent"]],
  ["keyword grouping software", "features/keyword-groups", [38, 34, 29, 25], ["Product"]],
  ["local rank tracker", "features/local-rank-tracking", [16, 14, 12, 9], ["Product"]],
  ["rank checker api", "docs/api", [13, 11, 9, 7], ["Docs", "High intent"]],
  ["saas seo reporting", "features/reporting", [29, 25, 22, 18], ["Product"]],
  ["search console alerts", "features/search-console", [21, 18, 16, 13], ["Product"]],
  ["serp volatility monitor", "features/serp-volatility", [35, 30, 27, 23], ["Product"]],
  ["weekly rank report", "features/weekly-reports", [17, 15, 13, 10], ["Product"]],
] as const;

export const acmeSeedKeywords: readonly AcmeKeywordFixture[] = [
  ...acmeKeywords,
  ...additionalAcmeKeywords.map(([text, path, positions, tags], index) => ({
    positions,
    publicId: `kw_acme_${String(index + 6).padStart(2, "0")}`,
    tags,
    targetUrl: `https://acme.dev/${path}`,
    text,
  })),
];
