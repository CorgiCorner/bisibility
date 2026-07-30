import "server-only";

import { prisma } from "@/lib/db/prisma";
import { projectLabel } from "@/lib/ops/labels";
import { notifyOps, shouldNotifyOpsSuccess } from "@/lib/ops/notify";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { classifyProviderFailure, type ProviderFailureClass } from "@/lib/providers/failure-class";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { getAnalyticsProvider } from "@/lib/providers/registry";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import type { TrafficKeyword } from "./match";
import { trafficRuntimeCredentials } from "./runtime-credentials";
import {
  hasPageStats,
  hasQueryStats,
  PAGE_STATS_LAG_DAYS,
  pruneTrafficSnapshots,
  QUERY_STATS_LAG_DAYS,
  QUERY_STATS_WINDOW_DAYS,
  statsWindow,
  type TrafficPruneSummary,
  type TrafficSnapshotSyncMetrics,
  upsertPageSnapshots,
  upsertQuerySnapshots,
} from "./snapshots";
import { addTrafficMetrics, emptyTrafficMetrics, warnIfTrafficTruncated } from "./sync-metrics";

type TrafficConnection = {
  credentialsEncrypted: string | null;
  id: string;
  provider: string;
};

export type TrafficConnectionSkip = {
  provider: string;
  reason: "no_capability" | "rate_limited";
};

export type TrafficSyncRunStatus =
  | "succeeded_with_data"
  | "succeeded_empty"
  | "deferred_rate_limit"
  | "failed"
  | "not_applicable";

export type TrafficConnectionRun = TrafficSnapshotSyncMetrics & {
  connectionId: string;
  error?: string;
  errorClass?: ProviderFailureClass;
  provider: string;
  status: TrafficSyncRunStatus;
};

export type ProjectTrafficSyncSummary = {
  connections: number;
  keywordSnapshots: number;
  pageSnapshots: number;
  projectId: string;
  runs: TrafficConnectionRun[];
  skipped: TrafficConnectionSkip[];
};

export type TrafficProjectRunResult =
  | { ok: true; projectId: string; summary: ProjectTrafficSyncSummary }
  | { error: string; ok: false; projectId: string };

export type SyncTrafficForAllProjectsResult = {
  projects: TrafficProjectRunResult[];
  pruned: TrafficPruneSummary;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown traffic sync error.";
}

const REDACTED_PROVIDER_ERROR = "Provider sync failed. See worker logs for details.";

async function notifyTrafficRun(projectId: string, run: TrafficConnectionRun): Promise<void> {
  if (run.status === "not_applicable") return;
  const successful = run.status === "succeeded_with_data" || run.status === "succeeded_empty";
  if (successful && !shouldNotifyOpsSuccess()) return;
  await notifyOps({
    ...(successful ? {} : { dedupeKey: `sync:${projectId}:${run.provider}` }),
    fields: {
      Connection: run.connectionId,
      ...(run.status === "failed" ? { Error: "provider_sync_failed" } : {}),
      ...(run.errorClass ? { "Error class": run.errorClass } : {}),
      Project: projectLabel(projectId),
      Provider: run.provider,
      Rows: `fetched=${run.rowsFetched}, matched=${run.rowsMatched}, upserted=${run.rowsUpserted}`,
      Status: run.status,
    },
    kind: "traffic_sync",
    severity:
      run.status === "failed" ? "error" : run.status === "deferred_rate_limit" ? "warning" : "info",
    title: `Traffic sync: ${run.status.replaceAll("_", " ")}`,
  }).catch(() => undefined);
}

async function recordOperationalRun(input: {
  connection: TrafficConnection;
  error?: string;
  errorClass?: ProviderFailureClass;
  finishedAt: Date;
  metrics: TrafficSnapshotSyncMetrics;
  projectId: string;
  scheduledFor: Date | null;
  startedAt: Date;
  status: TrafficSyncRunStatus;
}): Promise<void> {
  await prisma.operationalRun.create({
    data: {
      connectionId: input.connection.id,
      error: input.error,
      errorClass: input.errorClass,
      finishedAt: input.finishedAt,
      kind: "traffic_sync",
      meta: input.metrics,
      projectId: input.projectId,
      provider: input.connection.provider,
      scheduledFor: input.scheduledFor,
      startedAt: input.startedAt,
      status: input.status,
    },
  });
}

async function loadConnections(projectId: string): Promise<TrafficConnection[]> {
  return prisma.providerConnection.findMany({
    orderBy: providerChainOrderBy(),
    select: { credentialsEncrypted: true, id: true, provider: true },
    where: { ...providerChainWhere("analytics"), projectId },
  });
}

async function loadKeywords(projectId: string): Promise<TrafficKeyword[]> {
  return prisma.keyword.findMany({
    select: {
      id: true,
      rankChecks: {
        orderBy: { checkedAt: "desc" },
        select: { rankingUrl: true },
        take: 1,
        where: { rankingUrl: { not: null }, status: "completed" },
      },
      targetUrl: true,
      text: true,
    },
    where: { projectId },
  });
}

export async function syncTrafficForProject(
  projectId: string,
  now: Date,
  scheduledFor: Date | null = null,
): Promise<ProjectTrafficSyncSummary> {
  const [connections, keywords] = await Promise.all([
    loadConnections(projectId),
    loadKeywords(projectId),
  ]);
  const summary: ProjectTrafficSyncSummary = {
    connections: 0,
    keywordSnapshots: 0,
    pageSnapshots: 0,
    projectId,
    runs: [],
    skipped: [],
  };

  for (const connection of connections) {
    const startedAt = new Date();
    const metrics = emptyTrafficMetrics();
    let status: TrafficSyncRunStatus = "failed";
    let persistedError: string | undefined;
    let errorClass: ProviderFailureClass | undefined;

    try {
      const provider = getAnalyticsProvider(connection.provider);
      const canQuery = hasQueryStats(provider);
      const canPage = hasPageStats(provider);
      if (!canQuery && !canPage) {
        status = "not_applicable";
        summary.skipped.push({ provider: connection.provider, reason: "no_capability" });
      } else {
        const credentials = trafficRuntimeCredentials(connection);
        // Providers consume quota per request, so pre-consumption would double-count.
        // Isolate connections so one failure cannot skip later project sources.
        if (canQuery) {
          for (const windowDays of QUERY_STATS_WINDOW_DAYS) {
            const queryMetrics = await upsertQuerySnapshots(
              connection.provider,
              credentials,
              provider,
              keywords,
              statsWindow(now, QUERY_STATS_LAG_DAYS, windowDays),
            );
            addTrafficMetrics(metrics, queryMetrics);
            summary.keywordSnapshots += queryMetrics.rowsUpserted;
          }
          warnIfTrafficTruncated({
            connectionId: connection.id,
            metrics,
            projectId,
            provider: connection.provider,
          });
        }
        if (canPage) {
          const pageMetrics = await upsertPageSnapshots(
            projectId,
            connection.provider,
            credentials,
            provider,
            keywords,
            statsWindow(now, PAGE_STATS_LAG_DAYS),
          );
          addTrafficMetrics(metrics, pageMetrics);
          summary.pageSnapshots += pageMetrics.rowsUpserted;
        }

        status = metrics.rowsFetched === 0 ? "succeeded_empty" : "succeeded_with_data";
        summary.connections += 1;
        await prisma.providerConnection.update({
          data: { lastUsedAt: now },
          where: { id: connection.id },
        });
      }
    } catch (error) {
      errorClass = classifyProviderFailure(error);
      if (error instanceof ProviderAuthError) {
        persistedError = REDACTED_PROVIDER_ERROR;
        await markProviderNeedsReauth({
          connectionId: connection.id,
          projectId,
          provider: connection.provider,
        });
      } else if (error instanceof ProviderRateLimitedError) {
        status = "deferred_rate_limit";
        errorClass = undefined;
        summary.skipped.push({ provider: connection.provider, reason: "rate_limited" });
      } else {
        persistedError = REDACTED_PROVIDER_ERROR;
        console.error("[traffic] provider sync failed", {
          connectionId: connection.id,
          error,
          projectId,
          provider: connection.provider,
        });
      }
    }

    const finishedAt = new Date();
    await recordOperationalRun({
      connection,
      error: persistedError,
      errorClass,
      finishedAt,
      metrics,
      projectId,
      scheduledFor,
      startedAt,
      status,
    });
    const run: TrafficConnectionRun = {
      ...metrics,
      connectionId: connection.id,
      ...(persistedError ? { error: persistedError } : {}),
      ...(errorClass ? { errorClass } : {}),
      provider: connection.provider,
      status,
    };
    summary.runs.push(run);
    await notifyTrafficRun(projectId, run);
  }

  return summary;
}

export async function syncTrafficForAllProjects(
  now = new Date(),
  scheduledFor: Date | null = null,
): Promise<SyncTrafficForAllProjectsResult> {
  const projects = await prisma.project.findMany({
    select: { id: true },
    where: {
      providerConnections: { some: { enabled: true, kind: "analytics", status: "connected" } },
    },
  });
  const results: TrafficProjectRunResult[] = [];

  for (const project of projects) {
    try {
      results.push({
        ok: true,
        projectId: project.id,
        summary: await syncTrafficForProject(project.id, now, scheduledFor),
      });
    } catch (error) {
      console.error("[traffic] project sync failed", { error, projectId: project.id });
      results.push({ error: errorMessage(error), ok: false, projectId: project.id });
    }
  }

  return { projects: results, pruned: await pruneTrafficSnapshots(now) };
}
