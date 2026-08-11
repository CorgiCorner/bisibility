import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  compareProviderChainEntries,
  providerChainOrderBy,
  providerChainWhere,
} from "@/lib/rank-check/provider-chain-order";
import { keywordPathCandidates } from "@/lib/traffic/url-match";
import type { KeywordTrafficSummary } from "./keyword-row";

export type PageTrafficSnapshotLike = {
  bounceRate: number | null;
  date: Date;
  engagementRate: number | null;
  keyEvents: number | null;
  path: string;
  provider: string;
  scrollDepth: number | null;
  sessions: number;
  visitDurationSeconds: number | null;
  visitors: number | null;
  windowDays: number;
};

export type KeywordTrafficDetail = {
  hasAnalyticsConnection: boolean;
  hasSearchConsoleConnection?: boolean;
  pages: PageTrafficSnapshotLike[];
  query: (KeywordTrafficSummary & { position: number; windowDays: number }) | null;
};

type ProviderRank = { priority: number; provider: string };
type KeywordTrafficSnapshotRow = KeywordTrafficSummary & { keywordId: string; position: number };

const defaultProviderRank = { priority: 10_000 };

function providerRankMap(rows: ProviderRank[]) {
  return new Map(rows.map((row) => [row.provider, row]));
}

function compareProvider(providerRanks: Map<string, ProviderRank>, a: string, b: string) {
  const left = providerRanks.get(a) ?? { ...defaultProviderRank, provider: a };
  const right = providerRanks.get(b) ?? { ...defaultProviderRank, provider: b };
  return compareProviderChainEntries(left, right);
}

function isBetterQuerySnapshot(
  providerRanks: Map<string, ProviderRank>,
  current: KeywordTrafficSnapshotRow | undefined,
  next: KeywordTrafficSnapshotRow,
) {
  if (!current) return true;
  const dateDelta = next.date.getTime() - current.date.getTime();
  return (
    dateDelta > 0 ||
    (dateDelta === 0 && compareProvider(providerRanks, next.provider, current.provider) < 0)
  );
}

async function loadProviderContext(projectId: string) {
  const rows = await prisma.providerConnection.findMany({
    orderBy: providerChainOrderBy(),
    select: { priority: true, provider: true },
    where: { ...providerChainWhere("analytics"), projectId },
  });
  return {
    hasAnalyticsConnection: rows.length > 0,
    hasSearchConsoleConnection: rows.some((row) => row.provider === "gsc"),
    providerRanks: providerRankMap(rows),
  };
}

function selectNewestQuerySnapshot<T extends KeywordTrafficSnapshotRow>(
  rows: T[],
  providerRanks: Map<string, ProviderRank>,
) {
  let selected: T | undefined;
  for (const row of rows) {
    if (isBetterQuerySnapshot(providerRanks, selected, row)) selected = row;
  }
  return selected ?? null;
}

export async function fetchProjectKeywordTraffic(projectId: string) {
  const latest = await prisma.keywordTrafficSnapshot.aggregate({
    _max: { date: true },
    where: { keyword: { projectId } },
  });
  if (!latest._max.date) return new Map<string, KeywordTrafficSummary>();

  // A seven-day window from the project maximum tolerates provider lag without
  // scanning full retention history for every grid render.
  const cutoff = new Date(latest._max.date);
  cutoff.setUTCDate(cutoff.getUTCDate() - 7);

  const [snapshots, providerContext] = await Promise.all([
    prisma.keywordTrafficSnapshot.findMany({
      orderBy: [{ keywordId: "asc" }, { date: "desc" }, { provider: "asc" }],
      select: {
        clicks: true,
        ctr: true,
        date: true,
        impressions: true,
        keywordId: true,
        position: true,
        provider: true,
      },
      where: { date: { gte: cutoff }, keyword: { projectId } },
    }),
    loadProviderContext(projectId),
  ]);
  const providerRanks = providerContext.providerRanks;
  const traffic = new Map<string, KeywordTrafficSummary>();

  // Same-date ties use project provider metadata once: primary, then lowest priority,
  // then provider id for deterministic first-wins behavior.
  for (const snapshot of snapshots) {
    const current = traffic.get(snapshot.keywordId) as KeywordTrafficSnapshotRow | undefined;
    if (isBetterQuerySnapshot(providerRanks, current, snapshot)) {
      traffic.set(snapshot.keywordId, snapshot);
    }
  }

  return traffic;
}

function selectNewestPagesByProvider(rows: PageTrafficSnapshotLike[], candidates: string[]) {
  const selected = new Map<string, PageTrafficSnapshotLike>();
  const pathPriority = new Map(candidates.map((path, index) => [path, index]));

  for (const row of rows) {
    const current = selected.get(row.provider);
    const dateDelta = current ? row.date.getTime() - current.date.getTime() : 1;
    const pathDelta =
      (pathPriority.get(row.path) ?? candidates.length) -
      (pathPriority.get(current?.path ?? "") ?? candidates.length);
    if (!current || dateDelta > 0 || (dateDelta === 0 && pathDelta < 0)) {
      selected.set(row.provider, row);
    }
  }

  return Array.from(selected.values()).sort((a, b) => a.provider.localeCompare(b.provider));
}

export async function getKeywordTraffic(
  projectId: string,
  keywordId: string,
  keyword: { rankingUrl: string | null; targetUrl: string | null },
): Promise<KeywordTrafficDetail> {
  const [querySnapshots, providerContext] = await Promise.all([
    prisma.keywordTrafficSnapshot.findMany({
      orderBy: [{ date: "desc" }, { provider: "asc" }],
      select: {
        clicks: true,
        ctr: true,
        date: true,
        impressions: true,
        keywordId: true,
        position: true,
        provider: true,
        windowDays: true,
      },
      where: { keywordId, keyword: { projectId } },
    }),
    loadProviderContext(projectId),
  ]);

  const query = selectNewestQuerySnapshot(querySnapshots, providerContext.providerRanks);
  const candidates = keywordPathCandidates(keyword, keyword.rankingUrl);
  const pages = candidates.length
    ? await prisma.pageTrafficSnapshot.findMany({
        orderBy: [{ provider: "asc" }, { date: "desc" }],
        select: {
          bounceRate: true,
          date: true,
          engagementRate: true,
          keyEvents: true,
          path: true,
          provider: true,
          scrollDepth: true,
          sessions: true,
          visitDurationSeconds: true,
          visitors: true,
          windowDays: true,
        },
        where: { path: { in: candidates }, projectId },
      })
    : [];

  return {
    hasAnalyticsConnection: providerContext.hasAnalyticsConnection,
    hasSearchConsoleConnection: providerContext.hasSearchConsoleConnection,
    pages: selectNewestPagesByProvider(pages, candidates),
    query,
  };
}
