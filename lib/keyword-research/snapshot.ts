import "server-only";

import { prisma } from "@/lib/db/prisma";
import { demoResearchFreshUntil, isEditableDemoResearchProject } from "@/lib/demo/research-storage";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  type CanonicalKeywordResearchRequest,
  canonicalKeywordResearchRequest,
  keywordResearchRequestKey,
} from "./request-key";
import type {
  KeywordResearchOutcome,
  KeywordResearchRow,
  KeywordResearchSourceDiagnostic,
} from "./types";

export type KeywordResearchSnapshotInput = {
  fetchedAt: Date;
  freshUntil: Date;
  outcome: Pick<KeywordResearchOutcome & { ok: true }, "provider" | "rows" | "sources">;
  projectId: string;
  request: CanonicalKeywordResearchRequest;
};

function storedRows(rows: KeywordResearchRow[]) {
  return rows.map((row) => ({
    competition: row.competition,
    cpcCents: row.cpcCents,
    difficulty: row.difficulty,
    intent: row.intent,
    keyword: row.keyword,
    monthlyTrend: row.monthlyTrend.map((trend) => ({
      month: trend.month,
      searchVolume: trend.searchVolume,
      year: trend.year,
    })),
    searchVolume: row.searchVolume,
    source: row.source,
  }));
}

function storedSources(sources: KeywordResearchSourceDiagnostic[]) {
  return sources.map((source) => ({
    cached: source.cached,
    costCents: source.costCents,
    ...(source.reason ? { reason: source.reason } : {}),
    returned: source.returned,
    source: source.source,
    status: source.status,
  }));
}

function snapshotData(input: KeywordResearchSnapshotInput) {
  return {
    countryCode: input.request.countryCode,
    fetchedAt: input.fetchedAt,
    freshUntil: input.freshUntil,
    includeClickstream: input.request.includeClickstream,
    languageCode: input.request.languageCode,
    mode: input.request.mode,
    normalizedSeed: input.request.normalizedSeed,
    provider: input.outcome.provider,
    resultLimit: input.request.resultLimit,
    rows: storedRows(input.outcome.rows) as Prisma.InputJsonValue,
    seed: input.request.seed,
    sources: storedSources(input.outcome.sources) as Prisma.InputJsonValue,
  };
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function persistKeywordResearchSnapshot(input: KeywordResearchSnapshotInput) {
  const requestKey = keywordResearchRequestKey(input.request);
  const data = snapshotData(input);
  const where = { projectId_requestKey: { projectId: input.projectId, requestKey } };
  const newer = { projectId: input.projectId, requestKey, fetchedAt: { lte: input.fetchedAt } };
  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.keywordResearchSnapshot.updateMany({ data, where: newer });
      if (updated.count === 0) {
        await tx.keywordResearchSnapshot.create({
          data: { ...data, projectId: input.projectId, requestKey },
        });
      }
      return tx.keywordResearchSnapshot.findUniqueOrThrow({ where });
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    await prisma.keywordResearchSnapshot.updateMany({ data, where: newer });
    return prisma.keywordResearchSnapshot.findUniqueOrThrow({ where });
  }
}

export async function maybePersistKeywordResearchSnapshot(input: {
  connectionPublicId?: string;
  includeClickstream: boolean;
  location: { gl: string; hl: string };
  mode: CanonicalKeywordResearchRequest["mode"];
  outcome: KeywordResearchOutcome;
  project: { id: string; publicId: string };
  resultLimit: number;
  seed: string;
  successfulFetchedAts: readonly string[];
}) {
  if (!isEditableDemoResearchProject(input.project.publicId) || !input.outcome.ok) return null;
  if (input.outcome.estimate || input.successfulFetchedAts.length === 0) return null;
  const fetchedAt = new Date(input.outcome.fetchedAt);
  const freshUntil = demoResearchFreshUntil(input.successfulFetchedAts);
  if (!Number.isFinite(fetchedAt.getTime()) || !freshUntil) return null;
  return persistKeywordResearchSnapshot({
    fetchedAt,
    freshUntil,
    outcome: input.outcome,
    projectId: input.project.id,
    request: canonicalKeywordResearchRequest({
      connectionPublicId: input.connectionPublicId,
      countryCode: input.location.gl,
      includeClickstream: input.includeClickstream,
      languageCode: input.location.hl,
      mode: input.mode,
      resultLimit: input.resultLimit,
      seed: input.seed,
    }),
  });
}
