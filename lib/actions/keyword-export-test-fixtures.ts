import type { KeywordExportOptions, KeywordExportRow } from "./keyword-import-export-helpers";

export function exportOptions(scope: "current" | "history" = "history"): KeywordExportOptions {
  return {
    columns: {
      change: true,
      country: true,
      device: true,
      intent: true,
      tags: true,
      topic: true,
      url: true,
    },
    granularity: "daily",
    range: "all",
    scope,
  };
}

export function historicKeywordFixture(): KeywordExportRow {
  return {
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    device: "desktop",
    publicId: "kw_abcdefghijklmnopqrstuvwx",
    text: "rank tracker",
    location: "United States",
    targetUrl: "https://example.com/today",
    topic: null,
    intent: null,
    tags: [],
    rankChecks: [
      {
        checkedAt: new Date("2026-10-08T15:00:00.000Z"),
        normalizationVersion: "v1",
        position: 3,
        previousPosition: 5,
        provider: "serpapi",
        rankingUrl: 'https://example.com/b?q="quoted, text"',
        requestedDepth: 100,
      },
      {
        checkedAt: new Date("2026-10-01T09:00:00.000Z"),
        normalizationVersion: "v1",
        position: 5,
        previousPosition: 2,
        provider: "dataforseo",
        rankingUrl: "https://example.com/a",
        requestedDepth: 100,
      },
    ],
  };
}
