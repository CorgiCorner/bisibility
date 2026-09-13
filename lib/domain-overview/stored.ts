import "server-only";

import { prisma } from "@/lib/db/prisma";
import { demoResearchFreshUntil, demoResearchStorageState } from "@/lib/demo/research-storage";
import type {
  DomainRankMetrics,
  HistoricalOverviewRow,
  RankedKeywordsPage,
  RelevantPagesResult,
} from "@/lib/providers/types";
import type { DomainOverviewScope } from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function storedMetrics(value: unknown): DomainRankMetrics | null {
  if (value === null) return null;
  const source = record(value);
  if (Object.keys(source).length === 0) return null;
  return {
    count: nullableNumber(source.count),
    etv: nullableNumber(source.etv),
    estimatedTrafficCostCents: nullableNumber(source.estimatedTrafficCostCents),
    isDown: number(source.isDown),
    isLost: number(source.isLost),
    isNew: number(source.isNew),
    isUp: number(source.isUp),
    pos1: number(source.pos1),
    pos11_20: number(source.pos11_20),
    pos21_30: number(source.pos21_30),
    pos2_3: number(source.pos2_3),
    pos31_40: number(source.pos31_40),
    pos41_50: number(source.pos41_50),
    pos4_10: number(source.pos4_10),
    pos51_60: number(source.pos51_60),
    pos61_70: number(source.pos61_70),
    pos71_80: number(source.pos71_80),
    pos81_90: number(source.pos81_90),
    pos91_100: number(source.pos91_100),
  };
}

function storedModule<T extends RankedKeywordsPage | RelevantPagesResult>(
  value: unknown,
): T | null {
  const source = record(value);
  if (!Array.isArray(source.rows) || typeof source.costCents !== "number") return null;
  if (source.totalCount !== null && typeof source.totalCount !== "number") return null;
  return source as T;
}

function storedHistory(value: unknown) {
  return Array.isArray(value) ? (value as HistoricalOverviewRow[]) : null;
}

export type StoredDomainOverviewResult = {
  cached: true;
  costCents: 0;
  countryCode: string | null;
  fetchedAt: string;
  freshUntil: string;
  history: HistoricalOverviewRow[] | null;
  languageCode: string;
  locationCode: number;
  ok: true;
  overview: DomainRankMetrics | null;
  pages: RelevantPagesResult | null;
  partial: boolean;
  previousFetchedAt: string | null;
  previousOverview: DomainRankMetrics | null;
  previousSourceSnapshotAt: string | null;
  provider: string;
  savedAt: string;
  scope: DomainOverviewScope;
  sourceSnapshotAt: string | null;
  stale: boolean;
  state: "no_data" | "ok" | "partial";
  target: string;
  keywords: RankedKeywordsPage | null;
};

export async function findStoredDomainOverview(input: {
  countryCode?: string;
  languageCode: string;
  locationCode: number;
  now?: Date;
  projectId: string;
  scope: DomainOverviewScope;
  target: string;
}): Promise<StoredDomainOverviewResult | null> {
  const snapshot = await prisma.domainOverviewSnapshot.findUnique({
    where: {
      projectId_target_scope_locationCode_languageCode: {
        languageCode: input.languageCode.trim().toLowerCase(),
        locationCode: input.locationCode,
        projectId: input.projectId,
        scope: input.scope,
        target: input.target.trim().toLowerCase(),
      },
    },
  });
  if (!snapshot) return null;
  const freshUntil = demoResearchFreshUntil([snapshot.fetchedAt]);
  if (!freshUntil) return null;
  const overview = storedMetrics(snapshot.overview);
  const keywords = storedModule<RankedKeywordsPage>(snapshot.rankedKeywords);
  const pages = storedModule<RelevantPagesResult>(snapshot.relevantPages);
  const history = storedHistory(snapshot.history);
  const partial = overview !== null && (keywords === null || pages === null || history === null);
  return {
    cached: true,
    costCents: 0,
    countryCode: input.countryCode?.trim().toUpperCase() ?? null,
    fetchedAt: snapshot.fetchedAt.toISOString(),
    history,
    languageCode: snapshot.languageCode,
    locationCode: snapshot.locationCode,
    ok: true,
    overview,
    pages,
    partial,
    previousFetchedAt: snapshot.previousFetchedAt?.toISOString() ?? null,
    previousOverview: storedMetrics(snapshot.previousOverview),
    previousSourceSnapshotAt: snapshot.previousSourceSnapshotAt?.toISOString() ?? null,
    provider: snapshot.provider,
    scope: snapshot.scope === "subdomain" ? "subdomain" : "root",
    sourceSnapshotAt: snapshot.sourceSnapshotAt?.toISOString() ?? null,
    state: overview === null ? "no_data" : partial ? "partial" : "ok",
    target: snapshot.target,
    keywords,
    ...demoResearchStorageState({ freshUntil, now: input.now, savedAt: snapshot.fetchedAt }),
  };
}

export async function listStoredDomainOverviews(input: { now?: Date; projectId: string }) {
  const snapshots = await prisma.domainOverviewSnapshot.findMany({
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true, languageCode: true, locationCode: true, scope: true, target: true },
    where: { projectId: input.projectId },
  });
  return snapshots.flatMap((snapshot) => {
    const freshUntil = demoResearchFreshUntil([snapshot.fetchedAt]);
    if (!freshUntil) return [];
    return [
      {
        languageCode: snapshot.languageCode,
        locationCode: snapshot.locationCode,
        scope: snapshot.scope === "subdomain" ? "subdomain" : "root",
        target: snapshot.target,
        ...demoResearchStorageState({ freshUntil, now: input.now, savedAt: snapshot.fetchedAt }),
      },
    ];
  });
}
