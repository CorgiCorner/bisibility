import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { ProviderLookupSignal } from "@/lib/provider-lookups/paid-call";
import type {
  DomainRankMetrics,
  HistoricalOverviewRow,
  RankedKeywordsPage,
  RelevantPagesResult,
} from "@/lib/providers/types";
import { domainOverviewCachedUntil, withDomainOverviewCache } from "./cache";
import type { DomainOverviewProject, DomainOverviewSource } from "./context";
import { fetchDomainOverviewMetrics } from "./provider-call";
import type { DomainOverviewMarket, DomainOverviewScope } from "./types";

type Snapshot = Prisma.DomainOverviewSnapshotGetPayload<object>;

type SnapshotKey = DomainOverviewMarket & {
  projectId: string;
  scope: DomainOverviewScope;
  target: string;
};

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

export function snapshotMetrics(value: unknown): DomainRankMetrics | null {
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

function snapshotWhere(input: SnapshotKey) {
  return {
    projectId_target_scope_locationCode_languageCode: {
      languageCode: input.languageCode,
      locationCode: input.locationCode,
      projectId: input.projectId,
      scope: input.scope,
      target: input.target,
    },
  } as const;
}

export function shouldRollPrevious(previous: Date | string | null, next: Date | string | null) {
  return (
    previous !== null && next !== null && new Date(previous).getTime() !== new Date(next).getTime()
  );
}

function overviewJson(value: DomainRankMetrics | null) {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonObject);
}

function pageJson(value: RankedKeywordsPage | RelevantPagesResult | null) {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonObject);
}

function snapshotPage<T extends RankedKeywordsPage | RelevantPagesResult>(
  value: unknown,
): T | null {
  const source = record(value);
  if (!Array.isArray(source.rows) || typeof source.costCents !== "number") return null;
  if (source.totalCount !== null && typeof source.totalCount !== "number") return null;
  return source as T;
}

export function domainOverviewSnapshotData(snapshot: Snapshot) {
  return {
    cachedUntil: snapshot.cachedUntil.toISOString(),
    fetchedAt: snapshot.fetchedAt.toISOString(),
    overview: snapshotMetrics(snapshot.overview),
    previousFetchedAt: snapshot.previousFetchedAt?.toISOString() ?? null,
    previousOverview: snapshotMetrics(snapshot.previousOverview),
    previousSourceSnapshotAt: snapshot.previousSourceSnapshotAt?.toISOString() ?? null,
    provider: snapshot.provider,
    sourceSnapshotAt: snapshot.sourceSnapshotAt?.toISOString() ?? null,
  };
}

export function domainOverviewSnapshotModules(snapshot: Snapshot) {
  return {
    keywords: snapshotPage<RankedKeywordsPage>(snapshot.rankedKeywords),
    pages: snapshotPage<RelevantPagesResult>(snapshot.relevantPages),
  };
}

export function findDomainOverviewSnapshot(input: SnapshotKey & { now: Date; provider?: string }) {
  return prisma.domainOverviewSnapshot.findFirst({
    where: {
      cachedUntil: { gt: input.now },
      languageCode: input.languageCode,
      locationCode: input.locationCode,
      projectId: input.projectId,
      ...(input.provider ? { provider: input.provider } : {}),
      scope: input.scope,
      target: input.target,
    },
  });
}

export function findDomainOverviewSnapshotMetadata(
  input: SnapshotKey & { now: Date; provider?: string },
) {
  return prisma.domainOverviewSnapshot.findFirst({
    select: { cachedUntil: true, fetchedAt: true, overview: true, provider: true },
    where: {
      cachedUntil: { gt: input.now },
      languageCode: input.languageCode,
      locationCode: input.locationCode,
      projectId: input.projectId,
      ...(input.provider ? { provider: input.provider } : {}),
      scope: input.scope,
      target: input.target,
    },
  });
}

export async function persistDomainOverviewSnapshot(
  input: SnapshotKey & {
    fetchedAt: Date;
    overview: DomainRankMetrics | null;
    provider: string;
    sourceSnapshotAt: Date | null;
  },
) {
  const cachedUntil = new Date(domainOverviewCachedUntil(input.fetchedAt));
  return prisma.$transaction(async (tx) => {
    const where = snapshotWhere(input);
    const existing = await tx.domainOverviewSnapshot.findUnique({ where });
    if (!existing) {
      return tx.domainOverviewSnapshot.create({
        data: {
          cachedUntil,
          fetchedAt: input.fetchedAt,
          languageCode: input.languageCode,
          locationCode: input.locationCode,
          overview: overviewJson(input.overview),
          projectId: input.projectId,
          provider: input.provider,
          scope: input.scope,
          sourceSnapshotAt: input.sourceSnapshotAt,
          target: input.target,
        },
      });
    }
    const roll = shouldRollPrevious(existing.sourceSnapshotAt, input.sourceSnapshotAt);
    return tx.domainOverviewSnapshot.update({
      data: {
        cachedUntil,
        fetchedAt: input.fetchedAt,
        overview: overviewJson(input.overview),
        provider: input.provider,
        rankedKeywords: Prisma.DbNull,
        relevantPages: Prisma.DbNull,
        sourceSnapshotAt: input.sourceSnapshotAt,
        ...(roll
          ? {
              previousFetchedAt: existing.fetchedAt,
              previousOverview:
                existing.overview === null
                  ? Prisma.JsonNull
                  : (existing.overview as Prisma.InputJsonValue),
              previousSourceSnapshotAt: existing.sourceSnapshotAt,
            }
          : {}),
      },
      where,
    });
  });
}

export function persistDomainOverviewModules(
  input: SnapshotKey & {
    expectedFetchedAt: Date | string;
    keywords: RankedKeywordsPage | null;
    pages: RelevantPagesResult | null;
    provider: string;
  },
) {
  return prisma.domainOverviewSnapshot.updateMany({
    data: {
      rankedKeywords: pageJson(input.keywords),
      relevantPages: pageJson(input.pages),
    },
    where: {
      fetchedAt: new Date(input.expectedFetchedAt),
      languageCode: input.languageCode,
      locationCode: input.locationCode,
      projectId: input.projectId,
      provider: input.provider,
      scope: input.scope,
      target: input.target,
    },
  });
}

export function persistDomainOverviewHistory(
  input: SnapshotKey & { history: HistoricalOverviewRow[] },
) {
  return prisma.domainOverviewSnapshot.update({
    data: { history: input.history as Prisma.InputJsonValue },
    where: snapshotWhere(input),
  });
}

export async function resolveDomainOverviewSnapshot(
  input: SnapshotKey & {
    beforeLoad?: () => void;
    fresh?: boolean;
    key: string;
    project: DomainOverviewProject;
    source: DomainOverviewSource;
  },
) {
  if (!input.fresh) {
    const stored = await findDomainOverviewSnapshot({
      ...input,
      now: new Date(),
      provider: input.source.provider.id,
    });
    if (stored) {
      return {
        cached: true,
        costCents: 0,
        data: domainOverviewSnapshotData(stored),
        durable: true,
        modules: domainOverviewSnapshotModules(stored),
      };
    }
  }
  const lookup = await withDomainOverviewCache({
    fresh: input.fresh,
    key: input.key,
    load: async () => {
      input.beforeLoad?.();
      const result = await fetchDomainOverviewMetrics({
        budgetCapCents: input.project.budgetCapCents,
        languageCode: input.languageCode,
        locationCode: input.locationCode,
        projectId: input.projectId,
        scope: input.scope,
        source: input.source,
        target: input.target,
      });
      const fetchedAt = new Date();
      const stored = await persistDomainOverviewSnapshot({
        ...input,
        fetchedAt,
        overview: result.metrics,
        provider: input.source.provider.id,
        sourceSnapshotAt: result.sourceSnapshotAt ? new Date(result.sourceSnapshotAt) : null,
      });
      return { costCents: result.costCents, data: domainOverviewSnapshotData(stored) };
    },
  });
  if (lookup.status === "contended") {
    throw new ProviderLookupSignal({ ok: false, reason: "in_progress", resetAt: lookup.resetAt });
  }
  return {
    cached: lookup.cached,
    costCents: lookup.cached ? 0 : lookup.value.costCents,
    data: lookup.value.data,
    durable: false,
    modules: { keywords: null, pages: null },
  };
}
