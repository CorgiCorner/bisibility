import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { classifyProviderFailure } from "@/lib/providers/failure-class";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { formatSyncFailed, formatSyncPaused, logSyncInfo, type SyncStream } from "./activity-log";
import { SEARCH_INSIGHTS_SOURCE } from "./credentials";
import { USER_PAUSE_REASON, userPauseGuard } from "./user-pause";

// Provider messages can carry request detail, so the stored copy stays generic.
const REDACTED_IMPORT_ERROR = "Search insights import failed. See worker logs for details.";

export type ImportFailureReason = "error" | "needs_reauth" | "rate_limited";

export type ImportRow = Awaited<ReturnType<typeof loadImportRow>>;

export function loadImportRow(
  projectId: string,
  property: string,
  source = SEARCH_INSIGHTS_SOURCE,
) {
  return prisma.searchAnalyticsImport.findUnique({
    where: {
      projectId_property_source: { projectId, property, source },
    },
  });
}

export function importFailureReason(error: unknown): ImportFailureReason {
  if (error instanceof ProviderAuthError) return "needs_reauth";
  if (error instanceof ProviderRateLimitedError) return "rate_limited";
  return "error";
}

// A paused import is a limitation, not a failure: the rows already stored stay readable
// and the workflow retries on its own. Only a workflow that gives up writes "failed".
export async function recordImportFailure(input: {
  connectionId: string;
  error: unknown;
  importId: string;
  projectId: string;
  source?: "ga4" | "gsc";
  stream?: SyncStream;
}): Promise<ImportFailureReason> {
  const reason = importFailureReason(input.error);
  const source = input.source ?? SEARCH_INSIGHTS_SOURCE;
  if (reason === "needs_reauth") {
    await markProviderNeedsReauth({
      connectionId: input.connectionId,
      notifyOps: false,
      projectId: input.projectId,
      provider: source,
    });
  }
  // Only a real failure gets a sentence: a quota pause and a lost authorization are
  // limitations the strip renders from pausedReason, and a failure sentence beside them
  // would read as broken. The class stays for all three, so the reason is still observable.
  const failureClass = classifyProviderFailure(input.error);
  const changed = await prisma.searchAnalyticsImport.updateMany({
    data: {
      ...(reason === "error"
        ? { lastError: REDACTED_IMPORT_ERROR }
        : { pausedReason: reason, pauseStartedAt: null, pausedById: null, state: "paused" }),
      lastErrorClass: failureClass,
      ...(reason === "rate_limited" ? { lastQuotaPausedAt: new Date() } : {}),
    },
    where: {
      ...userPauseGuard(input.importId),
      ...(reason === "error"
        ? { OR: [{ lastError: { not: REDACTED_IMPORT_ERROR } }, { lastError: null }] }
        : { OR: [{ pausedReason: { not: reason } }, { state: { not: "paused" } }] }),
    },
  });
  if (changed.count > 0) {
    logSyncInfo(
      reason === "error"
        ? formatSyncPaused({ reason: "error", stream: input.stream ?? "backfill" })
        : formatSyncPaused({
            reason: reason === "rate_limited" ? "quota" : "authorization",
            stream: input.stream ?? "backfill",
          }),
    );
  }
  if (reason === "error") {
    console.error("[search-insights] import batch failed", {
      error: input.error,
      importId: input.importId,
      projectId: input.projectId,
    });
  }
  return reason;
}

export async function markImportFailed(
  projectId: string,
  property: string,
  source = SEARCH_INSIGHTS_SOURCE,
  stream: SyncStream = "backfill",
) {
  const changed = await prisma.searchAnalyticsImport.updateMany({
    data: { state: "failed" },
    where: {
      projectId,
      property,
      source,
      pausedReason: { not: USER_PAUSE_REASON },
      state: { not: "failed" },
    },
  });
  if (changed.count > 0) {
    logSyncInfo(formatSyncFailed({ failureClass: "unknown", stream }));
  }
}
