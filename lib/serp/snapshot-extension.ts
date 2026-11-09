import type {
  AcceptedActionPayment,
  ActionPaymentFailure,
  ActionPaymentOption,
  ActionPaymentQuote,
  ActionPaymentReceipt,
} from "@/lib/action-payment/contract";
import type { RetrievedRow } from "@/lib/checks/contract";
import type { SerpOrganicResult } from "@/lib/providers/types";
import type { SerpRankLocation } from "./location";

export const SNAPSHOT_EXTENSION_WINDOW_MS = 15 * 60_000;
export const SNAPSHOT_EXTENSION_LEASE_MS = 180_000;

export type SerpSnapshotContinuation = {
  version: 1;
  capturedAt: string;
  keyword: string;
  domain: string;
  device: "desktop" | "mobile";
  location: SerpRankLocation;
  nextStart: number;
  ended: boolean;
  /**
   * Organic results the provider actually returned for the pages fetched so far, before any row was
   * dropped as unclassifiable or beyond depth. Absent on snapshots saved before it was persisted.
   */
  organicReturned?: number;
  connectionId?: string;
};

import type { ObservationScope } from "@/lib/observation/types";

export type SnapshotPageEvidence = {
  version: 1;
  adapterVersion: "serpapi-observation-v1";
  nextStart: number;
  requestDepth: 10;
  observedAt: string | null;
  observedThrough: string | null;
  configuredScope: ObservationScope;
  effectiveScope: ObservationScope | null;
  /** Mixed-time extensions cannot enlarge the original observation's historical prefix. */
  completeThrough: null;
  completeness: "unknown";
};
export type SnapshotExtensionPage = {
  provider_response?: unknown;
  payment?: ActionPaymentReceipt;
  evidence?: SnapshotPageEvidence | null;
  start: number;
  fetchedAt: string;
  skippedDuplicates: number;
  /** Organic results the provider returned for this page, including rows not stored. */
  organicReturned?: number;
  rows: SerpOrganicResult[];
};

export type SnapshotExtensionState = {
  payment?: ActionPaymentReceipt;
  version: 1;
  state: "idle" | "running" | "failed" | "retryable";
  nextStart: number;
  ended: boolean;
  pages: SnapshotExtensionPage[];
  requestId?: string;
  leaseUntil?: string;
};

export type SnapshotExtensionReason =
  | "available"
  | "unsupported"
  | "legacy"
  | "expired"
  | "complete"
  | "running"
  | "failed"
  | "not_sent"
  | "disconnected";
export type SnapshotExtensionView = {
  payment?: ActionPaymentReceipt;
  reason: SnapshotExtensionReason;
  expiresAt: string | null;
  nextStart: number | null;
  pages: Array<Omit<SnapshotExtensionPage, "rows"> & { rows: RetrievedRow[] }>;
};

export type SnapshotExtensionInput = {
  checkId: string;
  nextStart: number;
  projectId: string;
  paymentOptionId?: string;
};
export type SnapshotExtensionFailure = {
  ok: false;
  reason: SnapshotExtensionReason | "unavailable" | ActionPaymentFailure;
  payment?: ActionPaymentReceipt;
};
export type PreviewSnapshotExtensionAction = (
  input: SnapshotExtensionInput,
) => Promise<
  | { ok: true; payment: ActionPaymentQuote; paymentOptions: ActionPaymentOption[] }
  | SnapshotExtensionFailure
>;
export type ExtendSnapshotAction = (
  input: SnapshotExtensionInput & { acceptedPayment?: AcceptedActionPayment },
) => Promise<{ ok: true; payment?: ActionPaymentReceipt } | SnapshotExtensionFailure>;

/** Preserve the first recorded URL and rank; never renumber gaps after deduplication. */
export function mergeSnapshotPage(
  existing: readonly SerpOrganicResult[],
  incoming: readonly SerpOrganicResult[],
) {
  function key(value: string) {
    try {
      const url = new URL(value);
      url.hash = "";
      return url.href;
    } catch {
      return value;
    }
  }
  const urls = new Set(existing.map((row) => key(row.url)));
  const ranks = new Set(existing.map((row) => row.rank));
  const rows: SerpOrganicResult[] = [];
  let skippedDuplicates = 0;
  for (const row of incoming) {
    if (urls.has(key(row.url)) || ranks.has(row.rank)) {
      skippedDuplicates++;
      continue;
    }
    urls.add(key(row.url));
    ranks.add(row.rank);
    rows.push(row);
  }
  return { rows, skippedDuplicates };
}

/**
 * Organic results already returned for one snapshot. SerpApi numbers `position` from 1 on every
 * page, so the next page continues at this ordinal, which also stays correct when an earlier page
 * held fewer than ten results. The persisted provider counts are used where present, because stored
 * rows omit unclassifiable and beyond-depth rows. Older data falls back to the stored rows (plus
 * skipped duplicates) and never drops below the highest stored rank.
 */
export function snapshotPrecedingOrganicCount(
  original: readonly Pick<SerpOrganicResult, "rank">[],
  pages: ReadonlyArray<{
    organicReturned?: number;
    rows: readonly Pick<SerpOrganicResult, "rank">[];
    skippedDuplicates: number;
  }>,
  originalOrganicReturned?: number,
) {
  const highest = (rows: readonly Pick<SerpOrganicResult, "rank">[]) =>
    rows.reduce((max, row) => Math.max(max, row.rank), 0);
  return pages.reduce(
    (count, page) =>
      page.organicReturned === undefined
        ? Math.max(count + page.rows.length + page.skippedDuplicates, highest(page.rows))
        : Math.max(count + page.organicReturned, highest(page.rows)),
    Math.max(originalOrganicReturned ?? 0, highest(original)),
  );
}
