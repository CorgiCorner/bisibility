import type { Prisma } from "@/lib/generated/prisma/client";
import type { ActiveSearchImportSnapshot } from "@/lib/search-insights/sync/operation-snapshot";
import { isProjectRunsStatusGroup, type ProjectRunsStatus } from "./filters";
import { PROJECT_RUN_GSC_IMPORT_KNOWN_STATES } from "./project-run";
import { GSC_ACTIVE_IMPORT_STATES, gscSnapshotStatusKey } from "./project-runs-gsc-snapshot";
import {
  type GscRunStatusKey,
  isGscRunStatusKey,
  isRankRunStatusKey,
  type RankRunStatusKey,
} from "./run-status-vocabulary";

const RANK_ACTIVE_STATUSES = ["queued", "running", "cancelling"] as const;
const RANK_FINISHED_STATUSES = ["completed", "cancelled"] as const;
const GSC_ATTENTION_PAUSE_REASONS = ["error", "needs_reauth", "user"] as const;
const GSC_KNOWN_PAUSE_REASONS = ["error", "needs_reauth", "rate_limited", "user"] as const;
const GSC_FINISHED_STATES = ["completed", "failed"] as const;
const NO_ROWS = { id: { in: [] as string[] } };

const RANK_KEY_WHERE: Record<RankRunStatusKey, Prisma.RankCheckRunWhereInput> = {
  planned: { status: "planned" },
  blocked: { status: "blocked" },
  queued: { status: "queued" },
  running: { status: "running" },
  cancelling: { status: "cancelling" },
  succeeded: { outcome: "succeeded", status: "completed" },
  partial: { outcome: "partial", status: "completed" },
  deferred: {
    outcome: "deferred",
    status: "completed",
    OR: [{ blockedReason: null }, { blockedReason: { not: "no_active_keywords" } }],
  },
  skipped: { status: "completed", blockedReason: "no_active_keywords" },
  failed: { outcome: "failed", status: "completed" },
  cancelled: { status: "cancelled" },
  not_confirmed: { outcome: null, status: "completed" },
};

// Stored rows only; the one live import is matched by id in gscStatusWhere.
const GSC_KEY_WHERE: Record<GscRunStatusKey, Prisma.SearchAnalyticsImportWhereInput> = {
  queued: { state: "queued" },
  importing: { state: "running" },
  paused: { pausedReason: "user", state: "paused" },
  waiting_for_google: { pausedReason: "rate_limited", state: "paused" },
  reconnect_required: { pausedReason: "needs_reauth", state: "paused" },
  waiting_for_data: { state: "waiting_for_first_data" },
  // Only the live snapshot can report an unavailable worker.
  delayed: NO_ROWS,
  failed: { OR: [{ state: "failed" }, { pausedReason: "error", state: "paused" }] },
  completed: { state: "completed" },
  status_unavailable: {
    OR: [
      { state: { notIn: [...PROJECT_RUN_GSC_IMPORT_KNOWN_STATES] } },
      {
        OR: [{ pausedReason: null }, { pausedReason: { notIn: [...GSC_KNOWN_PAUSE_REASONS] } }],
        state: "paused",
      },
    ],
  },
};

export function rankStatusWhere(status: ProjectRunsStatus): Prisma.RankCheckRunWhereInput {
  if (status === "all") return {};
  if (status === "active") return { status: { in: [...RANK_ACTIVE_STATUSES] } };
  if (status === "attention") {
    return { OR: [{ status: "blocked" }, { outcome: "failed", status: "completed" }] };
  }
  if (status === "finished") return { status: { in: [...RANK_FINISHED_STATUSES] } };
  return isRankRunStatusKey(status) ? RANK_KEY_WHERE[status] : NO_ROWS;
}

/** Unlaunched planned or blocked occurrences appear only under these statuses. */
export function includesUpcomingRuns(status: ProjectRunsStatus) {
  return ["all", "attention", "planned", "blocked"].includes(status);
}

export function upcomingStatusWhere(status: ProjectRunsStatus): Prisma.RankCheckRunWhereInput {
  if (status === "all") return {};
  if (status === "attention" || status === "blocked") return { status: "blocked" };
  if (status === "planned") return { status: "planned" };
  return NO_ROWS;
}

export function gscRawStatusWhere(
  status: ProjectRunsStatus,
): Prisma.SearchAnalyticsImportWhereInput {
  if (status === "all") return {};
  if (status === "active") {
    return {
      OR: [
        { state: { in: [...GSC_ACTIVE_IMPORT_STATES] } },
        { pausedReason: "rate_limited", state: "paused" },
      ],
    };
  }
  if (status === "attention") {
    return {
      OR: [
        { state: "failed" },
        { pausedReason: { in: [...GSC_ATTENTION_PAUSE_REASONS] }, state: "paused" },
      ],
    };
  }
  if (status === "finished") return { state: { in: [...GSC_FINISHED_STATES] } };
  return isGscRunStatusKey(status) ? GSC_KEY_WHERE[status] : NO_ROWS;
}

/**
 * A specific status places the live import by its snapshot key, so rows and counts are exact.
 * Group values keep their raw filter; the caller adjusts them for the live import.
 */
export function gscStatusWhere(
  status: ProjectRunsStatus,
  snapshot: ActiveSearchImportSnapshot | null,
): Prisma.SearchAnalyticsImportWhereInput {
  const raw = gscRawStatusWhere(status);
  if (!snapshot || isProjectRunsStatusGroup(status)) return raw;
  return gscSnapshotStatusKey(snapshot) === status
    ? { OR: [raw, { id: snapshot.id }] }
    : { AND: [raw, { id: { not: snapshot.id } }] };
}
