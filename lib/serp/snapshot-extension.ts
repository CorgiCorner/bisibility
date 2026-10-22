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
  payment?: ActionPaymentReceipt;
  evidence?: SnapshotPageEvidence | null;
  start: number;
  fetchedAt: string;
  skippedDuplicates: number;
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
