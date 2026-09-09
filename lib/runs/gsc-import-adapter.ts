import type { SearchAnalyticsImport } from "@/lib/generated/prisma/client";
import { SEARCH_INSIGHTS_SEARCH_TYPE } from "@/lib/search-insights/constants";
import { SEARCH_INSIGHTS_SOURCE } from "@/lib/search-insights/sync/credentials";

export type GscImportInput = Pick<
  SearchAnalyticsImport,
  | "createdAt"
  | "daysDone"
  | "daysTotal"
  | "id"
  | "lastProbeAt"
  | "lastSyncFinishedAt"
  | "lastSyncStartedAt"
  | "pausedReason"
  | "projectId"
  | "property"
  | "searchType"
  | "source"
  | "state"
  | "syncStartedAt"
>;

export type GscImportProgressInputs = Readonly<{
  // Stored planning counters only. They do not establish qualifying coverage.
  daysDone: number;
  daysTotal: number;
}>;

export type GscImportTimestamps = Readonly<{
  /** Import created. */
  createdAt: Date;
  /** Manual import request time, not a worker start. */
  lastSyncStartedAt: Date | null;
  /** Incremental-sync intent claim. */
  syncStartedAt: Date | null;
  /** Last import completion. */
  lastSyncFinishedAt: Date | null;
  /** Last provider check. */
  lastProbeAt: Date | null;
}>;

export type GscImportRecord = Readonly<{
  id: string;
  pausedReason: string | null;
  progress: GscImportProgressInputs;
  projectId: string;
  property: string;
  searchType: typeof SEARCH_INSIGHTS_SEARCH_TYPE;
  source: typeof SEARCH_INSIGHTS_SOURCE;
  state: string;
  timestamps: GscImportTimestamps;
}>;

/**
 * Converts one stored GSC history-import row into its durable Runs input.
 * It deliberately does not read observability, alter state, or create a sync ledger.
 */
export function adaptGscImport(input: GscImportInput): GscImportRecord | null {
  if (input.source !== SEARCH_INSIGHTS_SOURCE || input.searchType !== SEARCH_INSIGHTS_SEARCH_TYPE) {
    return null;
  }

  return {
    id: input.id,
    pausedReason: input.pausedReason,
    progress: { daysDone: input.daysDone, daysTotal: input.daysTotal },
    projectId: input.projectId,
    property: input.property,
    searchType: SEARCH_INSIGHTS_SEARCH_TYPE,
    source: SEARCH_INSIGHTS_SOURCE,
    state: input.state,
    timestamps: {
      createdAt: input.createdAt,
      lastProbeAt: input.lastProbeAt,
      lastSyncFinishedAt: input.lastSyncFinishedAt,
      lastSyncStartedAt: input.lastSyncStartedAt,
      syncStartedAt: input.syncStartedAt,
    },
  };
}

export function adaptGscImports(inputs: Iterable<GscImportInput>): GscImportRecord[] {
  const records: GscImportRecord[] = [];
  for (const input of inputs) {
    const record = adaptGscImport(input);
    if (record) records.push(record);
  }
  return records;
}
