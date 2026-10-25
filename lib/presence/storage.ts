import { prisma } from "@/lib/db/prisma";
import { Prisma, type UrlPresenceSource } from "@/lib/generated/prisma/client";
import type { GscUrlInspectionResult } from "@/lib/providers/analytics/gsc";
import { emitSignal } from "@/lib/signals/emit";
import { SIGNAL_TYPES } from "@/lib/signals/types";
import { normalizedCanonicalUrl } from "./url";

export type PresenceRow = {
  canonicalOk: boolean | null;
  checkedAt: Date | null;
  coverageState: string | null;
  lastCrawlAt: Date | null;
  url: string;
  verdict: string | null;
};

export function canonicalOk(result: GscUrlInspectionResult) {
  const google = normalizedCanonicalUrl(result.googleCanonical);
  const user = normalizedCanonicalUrl(result.userCanonical);
  return google && user ? google === user : null;
}

const tracked = [
  "verdict",
  "coverageState",
  "googleCanonical",
  "indexingState",
  "robotsTxtState",
  "pageFetchState",
] as const;
type Tracked = Partial<Record<(typeof tracked)[number], string | null>>;
function trackedValues(row: Tracked) {
  return Object.fromEntries(tracked.map((key) => [key, row[key] ?? null]));
}

export async function persistPresence(input: {
  canonical: boolean | null;
  inspection: GscUrlInspectionResult;
  now: Date;
  previous?: PresenceRow;
  projectId: string;
  url: string;
  source?: UrlPresenceSource;
  sitemapUrl?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    // Serialize the comparison and signal with every writer, including concurrent manual calls.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`presence:${input.projectId}:${input.url}`}))`;
    const where = { projectId_url: { projectId: input.projectId, url: input.url } };
    const previous = await tx.urlPresence.findUnique({ where });
    if (previous?.checkedAt && previous.checkedAt > input.now) return false;
    const result = input.inspection;
    const data = {
      ...trackedValues(result),
      verdict: result.verdict,
      coverageState: result.coverageState,
      googleCanonical: result.googleCanonical,
      indexingState: result.indexingState,
      robotsTxtState: result.robotsTxtState,
      pageFetchState: result.pageFetchState,
      canonicalOk: input.canonical,
      checkedAt: input.now,
      lastCrawlAt: result.lastCrawlAt,
      userCanonical: result.userCanonical,
      crawledAs: result.crawledAs,
      referringUrls: result.referringUrls,
      sitemaps: result.sitemap,
      richResultsSummary: result.richResultsResult ?? Prisma.DbNull,
      inspectionResultLink: result.inspectionResultLink,
      inspectionError:
        previous?.inspectionFailedAt && previous.inspectionFailedAt > input.now
          ? previous.inspectionError
          : null,
      fullInspectionRecorded: true,
      source: input.source ?? "keyword_target",
      ...(input.sitemapUrl !== undefined ? { sitemapUrl: input.sitemapUrl } : {}),
    };
    await tx.urlPresence.upsert({
      where,
      create: { ...data, projectId: input.projectId, url: input.url },
      update: data,
    });
    const before = previous ? trackedValues(previous) : null;
    const next = trackedValues(result);
    // Older rows know verdict/coverage only; newly collected fields establish their baseline.
    if (before && !previous?.fullInspectionRecorded)
      for (const key of tracked.slice(2)) before[key] = next[key];
    // The baseline is history, but never an indexed-state transition signal.
    if (!previous?.checkedAt || !before) {
      await tx.urlPresenceChange.create({
        data: {
          projectId: input.projectId,
          url: input.url,
          at: input.now,
          previous: Prisma.JsonNull,
          next,
        },
      });
      return false;
    }
    if (JSON.stringify(before) !== JSON.stringify(next)) {
      await tx.urlPresenceChange.create({
        data: { projectId: input.projectId, url: input.url, at: input.now, previous: before, next },
      });
    }
    if ((previous.verdict === "PASS") === (result.verdict === "PASS")) return false;
    await emitSignal(
      {
        happenedAt: input.now,
        projectId: input.projectId,
        source: "url_inspection",
        url: input.url,
        severity: result.verdict === "PASS" ? "info" : "warning",
        type: result.verdict === "PASS" ? SIGNAL_TYPES.urlIndexed : SIGNAL_TYPES.urlDeindexed,
        payload: {
          canonicalOk: input.canonical,
          coverageState: result.coverageState,
          lastCrawlAt: result.lastCrawlAt?.toISOString() ?? null,
          verdict: result.verdict,
        },
      },
      tx,
    );
    return true;
  });
}

export async function persistInspectionFailure(input: {
  projectId: string;
  url: string;
  now: Date;
  source: UrlPresenceSource;
  sitemapUrl?: string | null;
}) {
  const { projectId, url, now, ...origin } = input;
  // Failed attempts do not replace Google's last known state or create change history.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`presence:${projectId}:${url}`}))`;
    const where = { projectId_url: { projectId, url } };
    const previous = await tx.urlPresence.findUnique({ where });
    if (
      (previous?.checkedAt && previous.checkedAt > now) ||
      (previous?.inspectionFailedAt && previous.inspectionFailedAt > now)
    )
      return;
    await tx.urlPresence.upsert({
      where,
      create: {
        projectId,
        url,
        ...origin,
        checkedAt: null,
        inspectionFailedAt: now,
        inspectionError: "inspection_failed",
      },
      update: { ...origin, inspectionFailedAt: now, inspectionError: "inspection_failed" },
    });
  });
}
