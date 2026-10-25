import { stringValue } from "./google-client";

export type GscRichResults = {
  verdict: string | null;
  detectedItems: Array<{
    richResultType: string | null;
    itemCount: number;
    issueCount: number;
    issues: Array<{ severity: string | null; count: number }>;
  }>;
};

export type GscUrlInspectionResult = {
  coverageState: string | null;
  crawledAs: string | null;
  googleCanonical: string | null;
  indexingState: string | null;
  inspectionResultLink: string | null;
  lastCrawlAt: Date | null;
  lastCrawlTime: string | null;
  pageFetchState: string | null;
  referringUrls: string[];
  richResultsResult: GscRichResults | null;
  robotsTxtState: string | null;
  sitemap: string[];
  userCanonical: string | null;
  verdict: string | null;
};

type RichResultsResponse = {
  verdict?: unknown;
  detectedItems?: Array<{
    richResultType?: unknown;
    items?: Array<{
      name?: unknown;
      issues?: Array<{ severity?: unknown; issueMessage?: unknown }>;
    }>;
  }>;
};

export type UrlInspectionResponse = {
  inspectionResult?: {
    inspectionResultLink?: unknown;
    indexStatusResult?: Partial<Record<keyof GscUrlInspectionResult, unknown>>;
    richResultsResult?: RichResultsResponse;
  };
};

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function parsedDate(raw: string | null) {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function richResults(data: RichResultsResponse | undefined): GscRichResults | null {
  if (!data) return null;
  return {
    verdict: stringValue(data.verdict),
    detectedItems: (data.detectedItems ?? []).map((group) => {
      const counts = new Map<string | null, number>();
      for (const item of group.items ?? []) {
        for (const issue of item.issues ?? []) {
          const severity = stringValue(issue.severity);
          counts.set(severity, (counts.get(severity) ?? 0) + 1);
        }
      }
      return {
        richResultType: stringValue(group.richResultType),
        itemCount: group.items?.length ?? 0,
        issueCount: [...counts.values()].reduce((sum, count) => sum + count, 0),
        issues: [...counts].map(([severity, count]) => ({ severity, count })),
      };
    }),
  };
}

export function normalizeGscInspection(data: UrlInspectionResponse): GscUrlInspectionResult {
  const status = data.inspectionResult?.indexStatusResult ?? {};
  const lastCrawlTime = stringValue(status.lastCrawlTime);
  return {
    coverageState: stringValue(status.coverageState),
    crawledAs: stringValue(status.crawledAs),
    googleCanonical: stringValue(status.googleCanonical),
    indexingState: stringValue(status.indexingState),
    inspectionResultLink: stringValue(data.inspectionResult?.inspectionResultLink),
    lastCrawlAt: parsedDate(lastCrawlTime),
    lastCrawlTime,
    pageFetchState: stringValue(status.pageFetchState),
    referringUrls: strings(status.referringUrls),
    richResultsResult: richResults(data.inspectionResult?.richResultsResult),
    robotsTxtState: stringValue(status.robotsTxtState),
    sitemap: strings(status.sitemap),
    userCanonical: stringValue(status.userCanonical),
    verdict: stringValue(status.verdict),
  };
}
