import type { PaymentAmount } from "@/lib/action-payment/contract";

export const HISTORY_PAGE_SIZE = 30;
/** One extra row tells the caller whether another page exists. */
export const HISTORY_PAGE_TAKE = HISTORY_PAGE_SIZE + 1;
export const HISTORY_SUGGESTION_TAKE = 3;
/** Cap for pin-key, facet, and follow-up scans that are not the history page itself. */
export const HISTORY_SCAN_BOUND = 200;

export const researchHistorySurfaces = [
  "model_playground",
  "serp_playground",
  "keyword_research",
] as const;

export type ResearchHistorySurface = (typeof researchHistorySurfaces)[number];

export type HistoryCost =
  | { kind: "unknown" }
  | { kind: "cached" }
  | { kind: "amount"; amount: PaymentAmount };

export type HistoryFilter = {
  facet: "device" | "engine" | "market" | "mode" | "pinned";
  value: string;
};

export type HistoryChip = {
  facet: Exclude<HistoryFilter["facet"], "pinned">;
  value: string;
};

export type HistoryRowMeta =
  | { kind: "model"; engines: string[] }
  | { aiOverview: boolean; device: "desktop" | "mobile"; kind: "serp"; market: string }
  | { kind: "keyword"; mode: string; scope: string };

export type HistoryRow = {
  cost: HistoryCost;
  key: string;
  meta: HistoryRowMeta;
  occurredAt: string;
  pinned: boolean;
  title: string;
};

export type HistoryDayGroup = {
  day: string;
  label: "date" | "today" | "yesterday";
  rows: HistoryRow[];
};

export type HistoryPage = {
  chips: HistoryChip[];
  groups: HistoryDayGroup[];
  nextCursor: string | null;
  pinnedCount: number;
  timeZone: string;
  total: number;
};

export type HistoryQuery = {
  cursor: string | null;
  filters: HistoryFilter[];
  /** Suggestions ask for the three newest rows. Every other caller uses the page size. */
  limit?: typeof HISTORY_SUGGESTION_TAKE;
  query: string;
};
