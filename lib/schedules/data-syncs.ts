import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveDomainRatingCredentials } from "@/lib/domain-rating/credentials";
import { effectiveInspectionMode } from "@/lib/presence/budget-mode";
import { ProviderCredentialsDecryptError } from "@/lib/providers/crypto";
import { scheduledMaintenanceEnabled } from "@/lib/rank-check/scheduled-maintenance";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { readSearchInsightsConnection } from "@/lib/search-insights/sync/credentials";
import { USER_PAUSE_REASON } from "@/lib/search-insights/sync/user-pause";
import { syncPauseKinds } from "./sync-pauses";
import type { DataSyncKind, DataSyncSchedule, ScheduleStateReason } from "./types";

function enabledFlag(value: string | undefined) {
  return ["true", "1", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

/** A project control outside the Schedules switch that also stops a sync. */
type ExternalStop = { reason: ScheduleStateReason | null } | null | undefined;

/**
 * Reason precedence, widest scope first: the instance switch, then the integration, then a
 * project setting outside Schedules. The widest blocker must be cleared first (reconnecting does
 * not run a sync this instance has turned off), so it is the one reported, as on the base.
 */
export function dataSyncStateReason(blockers: {
  instance: boolean;
  connected: boolean;
  external?: ExternalStop;
}): ScheduleStateReason | null {
  if (!blockers.instance) return "instance_disabled";
  if (!blockers.connected) return "integration_disconnected";
  return blockers.external?.reason ?? null;
}

export async function listDataSyncSchedules(
  projectId: string,
  now: Date,
): Promise<DataSyncSchedule[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      publicId: true,
      domain: true,
      syncPauses: { select: { kind: true } },
      defaults: { select: { inspectionBudgetMode: true, inspectionDailyLimit: true } },
    },
  });
  if (!project) return [];
  const domain = trackedProjectDomain(project.domain);
  const [ratingCredentials, gsc, rating, sitemap, indexing] = await Promise.all([
    resolveDomainRatingCredentials(projectId, now),
    readSearchInsightsConnection(projectId).catch((error: unknown) => {
      if (!(error instanceof ProviderCredentialsDecryptError)) throw error;
      return { connection: null, problem: "unreadable" as const };
    }),
    prisma.domainRatingCheck.findFirst({
      where: { projectId, ...(domain ? { domain } : {}) },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, completedAt: true, error: true },
    }),
    prisma.sitemapSnapshot.findFirst({
      where: { projectId },
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true },
    }),
    prisma.pageIndexingDay.findFirst({
      where: { projectId },
      orderBy: { recordedAt: "desc" },
      select: { recordedAt: true, failed: true, stop: true, property: true },
    }),
  ]);
  const importSelect = {
    state: true,
    pausedReason: true,
    lastSyncFinishedAt: true,
    lastSyncStartedAt: true,
  } as const;
  const imported = gsc.connection
    ? await prisma.searchAnalyticsImport.findUnique({
        where: {
          projectId_property_source: {
            projectId,
            property: gsc.connection.property,
            source: "gsc",
          },
        },
        select: importSelect,
      })
    : await prisma.searchAnalyticsImport.findFirst({
        where: { projectId, source: "gsc" },
        orderBy: [{ lastSyncFinishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        select: importSelect,
      });
  const pausedKinds = new Set(project.syncPauses.map(({ kind }) => kind));
  const row = (
    sync_kind: DataSyncKind,
    name: string,
    blockers: {
      instance: boolean;
      connected: boolean;
      external?: ExternalStop;
    },
    cron: string,
    lastAt: Date | null,
    lastState: string | null,
  ): DataSyncSchedule => ({
    id: `sync:${project.publicId}:${sync_kind}`,
    name,
    kind: "data_sync",
    sync_kind,
    group: "data_sync",
    actions: ["read"],
    // A sync is never Active while it would not run: the Schedules pause and any other project
    // control that stops it both report paused.
    state: pausedKinds.has(syncPauseKinds[sync_kind]) || blockers.external ? "paused" : "active",
    state_reason: dataSyncStateReason(blockers),
    cadence: { frequency: "custom_cron", cron_expression: cron, timezone: "UTC" },
    target: { type: "project", domain },
    settings: {},
    limits: {},
    next_run_at: null,
    last_run_at: lastAt?.toISOString() ?? null,
    last_run_state: lastState,
    target_summary: {},
    monthly_cost_estimate_cents: null,
  });
  const inspectionMode = effectiveInspectionMode(project.defaults?.inspectionBudgetMode);
  const inspectionBudgetOff =
    inspectionMode === "off" ||
    (inspectionMode === "fixed" && project.defaults?.inspectionDailyLimit === 0);
  return [
    row(
      "domain_rating",
      "Domain rating",
      { instance: true, connected: Boolean(ratingCredentials) },
      "0 * * * *",
      rating?.createdAt ?? null,
      rating ? (!rating.completedAt ? "running" : rating.error ? "failed" : "succeeded") : null,
    ),
    row(
      "sitemap",
      "Sitemap sync",
      { instance: enabledFlag(process.env.SITEMAP_SYNC_ENABLED), connected: true },
      process.env.SITEMAP_SYNC_CRON?.trim() || "45 4 * * *",
      sitemap?.fetchedAt ?? null,
      sitemap ? "snapshot_saved" : null,
    ),
    row(
      "search_console",
      "Search Console import",
      {
        instance: scheduledMaintenanceEnabled(),
        connected: Boolean(gsc.connection),
        // The property-level pause on the import card stops the collector on its own.
        external: imported?.pausedReason === USER_PAUSE_REASON ? { reason: null } : null,
      },
      "40 12 * * *",
      imported?.lastSyncFinishedAt ?? imported?.lastSyncStartedAt ?? null,
      imported?.state ?? null,
    ),
    row(
      "page_indexing",
      "Page indexing",
      {
        instance: enabledFlag(process.env.PRESENCE_SYNC_ENABLED),
        connected: Boolean(gsc.connection),
        // An inspection budget of off (or fixed at 0) skips the daily run.
        external: inspectionBudgetOff ? { reason: "inspection_budget_off" } : null,
      },
      process.env.PRESENCE_SYNC_CRON?.trim() || "45 3 * * *",
      indexing?.recordedAt ?? null,
      indexing
        ? (indexing.stop ?? (indexing.failed > 0 ? "inspection_failures" : "summary_saved"))
        : null,
    ),
  ];
}
