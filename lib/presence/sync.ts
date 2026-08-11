import "server-only";

import { prisma } from "@/lib/db/prisma";
import { type GscUrlInspectionSession, gscAnalyticsProvider } from "@/lib/providers/analytics/gsc";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { ProviderRateLimitedError, providerAccountKey } from "@/lib/providers/rate-limit";
import type { ProviderCredentials } from "@/lib/providers/types";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { DEFAULT_INSPECTION_DAILY_LIMIT } from "./constants";
import { notifyPresenceBudgetExhausted } from "./ops";
import { canonicalOk, type PresenceRow, persistPresence } from "./storage";
import { presenceUrl } from "./url";

export type PresenceDeferredReason = "authorization" | "daily_budget" | "minute_rate_limit";

type InspectionProvider = Pick<typeof gscAnalyticsProvider, "createUrlInspectionSession">;
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
      signals: number;
      status: "checked";
      urls: number;
    };

export type SyncPresenceForAllProjectsResult = {
  checked: number;
  deferred: number;
  failed: number;
  projects: number;
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

async function targetUrls(projectId: string) {
  const rows = await prisma.keyword.findMany({
    select: { targetUrl: true },
    where: { projectId, targetUrl: { not: null } },
  });
  return Array.from(new Set(rows.flatMap((row) => presenceUrl(row.targetUrl) ?? []))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function selectUrls(urls: string[], presences: PresenceRow[], dailyLimit: number) {
  const checked = new Map(presences.map((presence) => [presence.url, presence.checkedAt]));
  return urls
    .slice()
    .sort((a, b) => {
      const left = checked.get(a)?.getTime() ?? Number.NEGATIVE_INFINITY;
      const right = checked.get(b)?.getTime() ?? Number.NEGATIVE_INFINITY;
      return left - right || a.localeCompare(b);
    })
    .slice(0, dailyLimit);
}

export async function syncPresenceForProject(
  projectId: string,
  now: Date = new Date(),
  provider: InspectionProvider = gscAnalyticsProvider,
): Promise<SyncPresenceForProjectResult> {
  const project = await prisma.project.findFirst({
    select: { defaults: { select: { inspectionDailyLimit: true } }, id: true },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
  if (!project) return { projectId, reason: "project_not_found", status: "skipped" };
  const dailyLimit = project.defaults?.inspectionDailyLimit ?? DEFAULT_INSPECTION_DAILY_LIMIT;
  if (dailyLimit === 0) return { projectId: project.id, reason: "disabled", status: "skipped" };

  const connection = await gscConnection(project.id);
  if (!connection) return { projectId: project.id, reason: "no_connection", status: "skipped" };

  const urls = await targetUrls(project.id);
  if (!urls.length) return { projectId: project.id, reason: "no_urls", status: "skipped" };

  const presences = await prisma.urlPresence.findMany({
    select: {
      canonicalOk: true,
      checkedAt: true,
      coverageState: true,
      lastCrawlAt: true,
      url: true,
      verdict: true,
    },
    where: { projectId: project.id, url: { in: urls } },
  });
  const previous = new Map(presences.map((presence) => [presence.url, presence]));
  const selected = selectUrls(urls, presences, dailyLimit);
  let checked = 0;
  let deferred = 0;
  let deferredReason: PresenceDeferredReason | null = null;
  let failed = 0;
  let signals = 0;
  let inspectionSession: GscUrlInspectionSession | null = null;

  for (const url of selected) {
    try {
      inspectionSession ??= await provider.createUrlInspectionSession(connection.credentials);
      const inspection = await inspectionSession.inspectUrl({
        property: connection.property,
        url,
      });
      const emitted = await persistPresence({
        canonical: canonicalOk(inspection),
        inspection,
        now,
        previous: previous.get(url),
        projectId: project.id,
        url,
      });
      checked += 1;
      if (emitted) signals += 1;
    } catch (error) {
      if (error instanceof ProviderAuthError) {
        failed += 1;
        deferred = selected.length - checked - failed;
        deferredReason = "authorization";
        await markProviderNeedsReauth({
          connectionId: connection.id,
          projectId: project.id,
          provider: "gsc",
        });
        break;
      }
      if (error instanceof ProviderRateLimitedError) {
        deferred = selected.length - checked - failed;
        deferredReason =
          error.source === "provider" && error.scope !== "minute"
            ? "daily_budget"
            : "minute_rate_limit";
        break;
      }
      failed += 1;
      console.error("[presence] url inspection failed", { error, projectId: project.id, url });
    }
  }

  return {
    attempted: selected.length,
    checked,
    deferred,
    deferredReason,
    failed,
    projectId: project.id,
    propertyAccountKey: providerAccountKey("gsc", connection.credentials, {
      projectId: project.id,
    }),
    property: connection.property,
    signals,
    status: "checked",
    urls: urls.length,
  };
}

export async function syncPresenceForAllProjects(
  now: Date = new Date(),
): Promise<SyncPresenceForAllProjectsResult> {
  const projects = await prisma.project.findMany({
    select: { id: true },
    where: {
      providerConnections: {
        some: { enabled: true, kind: "analytics", provider: "gsc", status: "connected" },
      },
    },
  });
  const summary = {
    checked: 0,
    deferred: 0,
    failed: 0,
    projects: projects.length,
    signals: 0,
    skipped: 0,
    urls: 0,
  };
  const budgetExhaustions = new Map<
    string,
    { deferred: number; projectIds: string[]; property: string; propertyAccountKey: string }
  >();

  for (const project of projects) {
    try {
      const result = await syncPresenceForProject(project.id, now);
      if (result.status === "skipped") {
        summary.skipped += 1;
        continue;
      }
      summary.checked += result.checked;
      summary.deferred += result.deferred;
      summary.failed += result.failed;
      summary.signals += result.signals;
      summary.urls += result.urls;
      if (result.deferredReason === "daily_budget") {
        const exhausted = budgetExhaustions.get(result.propertyAccountKey) ?? {
          deferred: 0,
          projectIds: [],
          property: result.property,
          propertyAccountKey: result.propertyAccountKey,
        };
        exhausted.deferred += result.deferred;
        exhausted.projectIds.push(result.projectId);
        budgetExhaustions.set(result.propertyAccountKey, exhausted);
      }
    } catch (error) {
      summary.failed += 1;
      console.error("[presence] project sync failed", { error, projectId: project.id });
    }
  }

  await Promise.all(
    [...budgetExhaustions.values()].map((exhaustion) => notifyPresenceBudgetExhausted(exhaustion)),
  );

  return summary;
}
