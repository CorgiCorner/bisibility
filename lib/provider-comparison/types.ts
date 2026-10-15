export const comparisonProviders = ["dataforseo", "serpapi"] as const;
export type ComparisonProvider = (typeof comparisonProviders)[number];
export type ComparisonSideStatus =
  | "queued"
  | "claimed"
  | "completed"
  | "failed"
  | "unknown"
  | "cancelled";
export type ComparisonConnectionState = "ready" | "missing" | "unavailable" | "quote_unavailable";
export type ComparisonContext = {
  keyword: { id: string; text: string; device: "desktop" | "mobile"; locationLabel: string };
  providers: {
    provider: ComparisonProvider;
    state: ComparisonConnectionState;
    fundingSource: "own" | "hosted" | null;
  }[];
  available: boolean;
};
export type ComparisonQuote = {
  provider: ComparisonProvider;
  estimatedCostCents: number;
  nativeUnit: "cents" | "searches";
  nativeQuantity: number;
  fundingSource: "own" | "hosted";
};
/** IDs here are scoped request UUIDs, not public resource IDs or authorization tokens. */
export type ComparisonPreview = {
  id: string;
  hash: string;
  expiresAt: string;
  keyword: ComparisonContext["keyword"];
  depth: 20;
  sides: ComparisonQuote[];
};
export type ComparisonResult = {
  observedAt: string | null;
  recordedAt: string;
  position: number | null;
  rankingUrl: string | null;
  results: { rank: number; url: string; title: string | null; domain: string | null }[];
  configuredScope: unknown;
  effectiveScope: unknown;
  completeness: string;
  normalizationVersion: string | null;
  evidence: "positive" | "known_absent" | "unknown";
  completeThrough: number | null;
};
export type ComparisonRun = {
  id: string;
  createdAt: string;
  keyword: ComparisonContext["keyword"];
  depth: 20;
  sides: {
    provider: ComparisonProvider;
    status: ComparisonSideStatus;
    costCents: number | null;
    customerCostCents?: number | null;
    fundingSource?: "own" | "hosted";
    quantity: number | null;
    reason: string | null;
    result: ComparisonResult | null;
  }[];
};
