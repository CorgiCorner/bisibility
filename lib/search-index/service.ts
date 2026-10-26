import "server-only";

import { prisma } from "@/lib/db/prisma";
import { effectiveInspectionMode } from "@/lib/presence/budget-mode";
import {
  assertInspectionReservationCurrent,
  InspectionAllowanceExpiredError,
  releaseInspections,
  reserveInspections,
} from "@/lib/presence/inspection-budget";
import {
  propertyQuotaKey,
  recordProperty429,
  startPropertyInspection,
} from "@/lib/presence/property-quota";
import { canonicalOk, persistInspectionFailure, persistPresence } from "@/lib/presence/storage";
import { presenceUrl } from "@/lib/presence/url";
import { type GscUrlInspectionSession, gscAnalyticsProvider } from "@/lib/providers/analytics/gsc";
import { normalizeGscProperty } from "@/lib/providers/analytics/gsc-property";
import {
  assertGscProperty,
  assertGscPropertyUrl,
  GscPropertyUrlError,
} from "@/lib/providers/analytics/gsc-property-membership";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { markProviderNeedsReauth } from "@/lib/providers/auth-state";
import { nextPacificMidnight } from "@/lib/providers/pacific-reset";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import { providerChainOrderBy, providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { trafficRuntimeCredentials } from "@/lib/traffic/runtime-credentials";
import { searchIndexInspectionSchema, searchIndexSitemapPathSchema } from "./schema";

export class SearchIndexConnectionError extends Error {
  constructor() {
    super("No connected Search Console property is available for this project.");
    this.name = "SearchIndexConnectionError";
  }
}

export async function connectionForProject(projectId: string) {
  const connection = await prisma.providerConnection.findFirst({
    orderBy: providerChainOrderBy(),
    select: { credentialsEncrypted: true, id: true, provider: true },
    where: { ...providerChainWhere("analytics"), projectId, provider: "gsc" },
  });
  if (!connection?.credentialsEncrypted) throw new SearchIndexConnectionError();
  const credentials = trafficRuntimeCredentials(connection);
  const property = normalizeGscProperty(credentials.login ?? "");
  assertGscProperty(property);
  return { connection, credentials, property };
}

type Connection = Awaited<ReturnType<typeof connectionForProject>>;
async function markAuth(error: unknown, selected: Connection, projectId: string) {
  if (!(error instanceof ProviderAuthError)) return;
  await markProviderNeedsReauth({
    connectionId: selected.connection.id,
    projectId,
    provider: "gsc",
  });
}

export async function listSearchIndexSitemaps(projectId: string) {
  const selected = await connectionForProject(projectId);
  try {
    return {
      property: selected.property,
      sitemaps: await gscAnalyticsProvider.listSitemaps(selected.credentials),
    };
  } catch (error) {
    await markAuth(error, selected, projectId);
    throw error;
  }
}

export async function getSearchIndexSitemap(projectId: string, path: string) {
  searchIndexSitemapPathSchema.parse(path);
  const selected = await connectionForProject(projectId);
  assertGscPropertyUrl(selected.property, path);
  try {
    return {
      property: selected.property,
      sitemap: await gscAnalyticsProvider.getSitemapStatus(selected.credentials, path),
    };
  } catch (error) {
    await markAuth(error, selected, projectId);
    throw error;
  }
}

type InspectionError =
  | {
      code: "inspection_daily_limit" | "inspection_failed" | "provider_authorization";
      message: string;
    }
  | {
      code: "provider_rate_limited";
      message: string;
      resetAt: string;
      scope: "daily" | "minute" | "unknown";
    };
export type SearchIndexInspectionRow = {
  url: string;
  error: InspectionError | null;
  inspection: Awaited<ReturnType<GscUrlInspectionSession["inspectUrl"]>> | null;
};

export async function inspectSearchIndexUrls(
  projectId: string,
  body: unknown,
  actorId?: string | null,
) {
  const input = searchIndexInspectionSchema.parse(body);
  const selected = await connectionForProject(projectId);
  // Validate the whole batch before refreshing a token or consuming any allowance.
  for (const url of input.urls) assertGscPropertyUrl(selected.property, url);
  const urls = [
    ...new Set(
      input.urls.map((url) => {
        const normalized = presenceUrl(url);
        if (!normalized) throw new GscPropertyUrlError();
        return normalized;
      }),
    ),
  ];
  const defaults = await prisma.projectDefaults.findUnique({ where: { projectId } });
  const mode = effectiveInspectionMode(defaults?.inspectionBudgetMode);
  const accountKey = propertyQuotaKey(selected.property);
  const admission = await reserveInspections({ projectId, actorId, urls });
  const admitted = new Set(admission.admitted);
  const prior = new Map(admission.previous.map((row) => [row.url, row]));
  const results: SearchIndexInspectionRow[] = [];
  let session: GscUrlInspectionSession | undefined;
  let stopped: InspectionError | undefined;
  const sentUrls = new Set<string>();
  try {
    for (const url of urls) {
      if (!admitted.has(url)) {
        results.push({
          url,
          inspection: null,
          error: {
            code: "inspection_daily_limit",
            message:
              "Project daily inspection limit reached. No Google request was made for this URL.",
          },
        });
        continue;
      }
      if (stopped) {
        results.push({ url, inspection: null, error: stopped });
        continue;
      }
      try {
        session ??= await gscAnalyticsProvider.createUrlInspectionSession(selected.credentials);
        assertInspectionReservationCurrent(admission.dayEnd);
        await startPropertyInspection(accountKey, mode);
        sentUrls.add(url);
        const inspection = await session.inspectUrl({ property: selected.property, url });
        await persistPresence({
          projectId,
          url,
          inspection,
          canonical: canonicalOk(inspection),
          previous: prior.get(url),
          source: "manual",
          now: new Date(),
        });
        results.push({ url, inspection, error: null });
      } catch (error) {
        await recordProperty429(accountKey, error);
        if (
          !(error instanceof ProviderRateLimitedError) &&
          !(error instanceof ProviderAuthError) &&
          !(error instanceof InspectionAllowanceExpiredError)
        )
          await persistInspectionFailure({ projectId, url, now: new Date(), source: "manual" });
        await markAuth(error, selected, projectId);
        if (error instanceof InspectionAllowanceExpiredError)
          stopped = { code: "inspection_daily_limit", message: error.message };
        if (error instanceof ProviderAuthError)
          stopped = {
            code: "provider_authorization",
            message: "Provider authorization must be renewed.",
          };
        if (error instanceof ProviderRateLimitedError)
          stopped = {
            code: "provider_rate_limited",
            message:
              "Search Console rate limit reached; no further URLs in this request were sent.",
            resetAt:
              error.scope === "daily"
                ? nextPacificMidnight(new Date()).toISOString()
                : new Date(
                    Math.max(error.resetAt, Date.now() + (error.retryAfterMs ?? 0)),
                  ).toISOString(),
            scope: error.scope,
          };
        results.push({
          url,
          inspection: null,
          error: stopped ?? {
            code: "inspection_failed",
            message:
              "Inspection or result storage failed. Every URL sent to Google counts against the daily allowance, even when the call fails.",
          },
        });
      }
    }
  } finally {
    await releaseInspections({
      projectId,
      actorId,
      targetId: admission.targetId,
      reservationAt: admission.reservationAt,
      released: admission.admitted.length - sentUrls.size,
    });
  }
  return { property: selected.property, results };
}
