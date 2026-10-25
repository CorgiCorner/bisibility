import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isSelfHost } from "@/lib/deployment/deployment";
import { type GscUrlInspectionSession, gscAnalyticsProvider } from "@/lib/providers/analytics/gsc";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { nextPacificMidnight } from "@/lib/providers/pacific-reset";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import type { ProviderCredentials } from "@/lib/providers/types";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { effectiveInspectionMode } from "./budget-mode";
import { orderInspectionCandidates, refreshInspectionCandidates } from "./candidates";
import { DEFAULT_INSPECTION_DAILY_LIMIT } from "./constants";
import { persistIndexingDay } from "./daily-summary";
import {
  assertInspectionReservationCurrent,
  InspectionAllowanceExpiredError,
  releaseInspections,
  reserveInspections,
} from "./inspection-budget";
import {
  createInspectionRetry,
  type InspectionRetryOptions,
  InspectionRunDeadlineError,
} from "./inspection-retry";
import { propertyQuotaKey, recordProperty429, startPropertyInspection } from "./property-quota";
import { canonicalOk, persistInspectionFailure, persistPresence } from "./storage";

export type PresenceDeferredReason =
  | "authorization"
  | "daily_budget"
  | "minute_rate_limit"
  | "project_allowance"
  | "run_deadline"
  | "unknown_rate_limit";

type InspectionProvider = Pick<typeof gscAnalyticsProvider, "createUrlInspectionSession"> &
  Partial<Pick<typeof gscAnalyticsProvider, "listSitemaps">>;
type Connection = { credentials: ProviderCredentials; id: string; property: string };

export type SyncPresenceForProjectResult =
  | {
      projectId: string;
      reason: "disabled" | "no_connection" | "no_urls" | "project_not_found";
      status: "skipped";
    }
  | {
      attempted: number;
      checked: number;
      deferred: number;
      deferredReason: PresenceDeferredReason | null;
      failed: number;
      projectId: string;
      propertyAccountKey: string;
      property: string;
      resetAt: Date | null;
      signals: number;
      status: "checked";
      urls: number;
    };

export type SyncPresenceForAllProjectsResult = {
  checked: number;
  deferred: number;
  failed: number;
  projects: number;
  deferredProjects: number;
  signals: number;
  skipped: number;
  urls: number;
};

async function gscConnection(projectId: string): Promise<Connection | null> {
  const connection = await prisma.providerConnection.findFirst({
    orderBy: providerChainOrderBy(),
    select: { credentialsEncrypted: true, id: true },
    where: {
      ...providerChainWhere("analytics"),
      projectId,
      provider: "gsc",
    },
  });
  if (!connection?.credentialsEncrypted) return null;
  const credentials = decryptProviderCredentials(connection.credentialsEncrypted);
  const property = credentials.login?.trim();
  return property ? { credentials, id: connection.id, property } : null;
}

export async function syncPresenceForProject(
  projectId: string,
  now: Date = new Date(),
  provider: InspectionProvider = gscAnalyticsProvider,
  options: InspectionRetryOptions = {},
): Promise<SyncPresenceForProjectResult> {
  const runDeadline = options.runDeadline ?? (options.clock ?? Date.now)() + 20 * 60 * 1000;
  options = { ...options, runDeadline };
  const project = await prisma.project.findFirst({
    select: {
      defaults: { select: { inspectionDailyLimit: true, inspectionBudgetMode: true } },
      id: true,
    },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
  if (!project) return { projectId, reason: "project_not_found", status: "skipped" };
  const dailyLimit = project.defaults?.inspectionDailyLimit ?? DEFAULT_INSPECTION_DAILY_LIMIT;
  const mode = effectiveInspectionMode(project.defaults?.inspectionBudgetMode, isSelfHost);
  const connection = await gscConnection(project.id);
  const finish = async (result: SyncPresenceForProjectResult) => {
    let stop: "quota" | "off" | null = null;
    if (result.status === "skipped" && result.reason === "disabled")
      stop = mode === "off" ? "off" : "quota";
    if (
      result.status === "checked" &&
      ["daily_budget", "project_allowance"].includes(result.deferredReason ?? "")
    )
      stop = "quota";
    await persistIndexingDay({
      projectId: project.id,
      property: connection?.property ?? null,
      now,
      stop,
    });
    return result;
  };
  if (mode === "off" || (mode === "fixed" && dailyLimit === 0))
    return finish({ projectId: project.id, reason: "disabled", status: "skipped" });
  if (!connection)
    return finish({ projectId: project.id, reason: "no_connection", status: "skipped" });

  const candidateUrls = await refreshInspectionCandidates({
    projectId: project.id,
    property: connection.property,
    now,
    runDeadline,
    clock: options.clock,
    listSitemaps: () =>
      (provider.listSitemaps ?? gscAnalyticsProvider.listSitemaps)(connection.credentials),
  });
  const presences = await prisma.urlPresence.findMany({
    where: { projectId: project.id, url: { in: candidateUrls } },
  });
  const urls = presences.map((row) => row.url);
  if (!urls.length) return finish({ projectId: project.id, reason: "no_urls", status: "skipped" });
  const previous = new Map(presences.map((presence) => [presence.url, presence]));
  const eligible = orderInspectionCandidates(presences, connection.property, now).map(
    (row) => row.url,
  );
  const reservation = await reserveInspections({
    projectId: project.id,
    actorId: null,
    urls: eligible,
    repeatsFrom: presences,
    skipEmpty: true,
  });
  const selected = reservation.admitted;
  const allowanceDeferred = eligible.length - selected.length;
  const propertyAccountKey = propertyQuotaKey(connection.property);
  const retry = createInspectionRetry(options);
  let resetAt = options.dailyExhaustions?.get(propertyAccountKey) ?? null;
  let checked = 0;
  let deferred = allowanceDeferred + (resetAt ? selected.length : 0);
  let deferredReason: PresenceDeferredReason | null = resetAt
    ? "daily_budget"
    : allowanceDeferred > 0
      ? "project_allowance"
      : null;
  let failed = 0;
  let signals = 0;
  // A URL counts against the reservation once its first Google call starts, retries included.
  const sentUrls = new Set<string>();
  let inspectionSession: GscUrlInspectionSession | null = null;

  try {
    for (const url of selected) {
      if ((options.clock ?? Date.now)() >= runDeadline) {
        deferred = allowanceDeferred + selected.length - checked - failed;
        deferredReason = "run_deadline";
        break;
      }
      if (resetAt) break;
      try {
        const inspection = await retry(async (signal) => {
          inspectionSession ??= await provider.createUrlInspectionSession(connection.credentials);
          signal?.throwIfAborted();
          assertInspectionReservationCurrent(
            reservation.dayEnd,
            new Date((options.clock ?? Date.now)()),
          );
          await startPropertyInspection(propertyAccountKey, mode);
          signal?.throwIfAborted();
          sentUrls.add(url);
          try {
            return await inspectionSession.inspectUrl({
              property: connection.property,
              url,
              signal,
            });
          } catch (error) {
            await recordProperty429(propertyAccountKey, error);
            throw error;
          }
        });
        const emitted = await persistPresence({
          canonical: canonicalOk(inspection),
          inspection,
          now,
          previous: previous.get(url),
          source: previous.get(url)?.source ?? "keyword_target",
          sitemapUrl: previous.get(url)?.sitemapUrl,
          projectId: project.id,
          url,
        });
        checked += 1;
        if (emitted) signals += 1;
      } catch (error) {
        if (error instanceof InspectionRunDeadlineError) {
          deferred = allowanceDeferred + selected.length - checked - failed;
          deferredReason = "run_deadline";
          break;
        }
        if (error instanceof InspectionAllowanceExpiredError) {
          deferred = allowanceDeferred + selected.length - checked - failed;
          deferredReason = "project_allowance";
          break;
        }
        if (error instanceof ProviderAuthError) {
          failed += 1;
          deferred = allowanceDeferred + selected.length - checked - failed;
          deferredReason = "authorization";
          await markProviderNeedsReauth({
            connectionId: connection.id,
            projectId: project.id,
            provider: "gsc",
          });
          break;
        }
        if (error instanceof ProviderRateLimitedError) {
          deferred = allowanceDeferred + selected.length - checked - failed;
          deferredReason =
            error.scope === "minute" || (error.source === "local" && error.scope !== "daily")
              ? "minute_rate_limit"
              : error.scope === "daily"
                ? "daily_budget"
                : "unknown_rate_limit";
          // Unknown exhaustion is transient evidence, not proof of a daily budget limit.
          if (deferredReason === "daily_budget") {
            resetAt = nextPacificMidnight(now);
            if (error.source === "provider")
              options.dailyExhaustions?.set(propertyAccountKey, resetAt);
          }
          break;
        }
        failed += 1;
        await persistInspectionFailure({
          projectId: project.id,
          url,
          now,
          source: previous.get(url)?.source ?? "keyword_target",
        });
        console.error("[presence] url inspection failed", { error, projectId: project.id, url });
      }
    }
  } finally {
    await releaseInspections({
      projectId: project.id,
      targetId: reservation.targetId,
      reservationAt: reservation.reservationAt,
      released: selected.length - sentUrls.size,
    });
  }
  return finish({
    attempted: selected.length,
    checked,
    deferred,
    deferredReason,
    failed,
    projectId: project.id,
    propertyAccountKey,
    property: connection.property,
    resetAt,
    signals,
    status: "checked",
    urls: urls.length,
  });
}
