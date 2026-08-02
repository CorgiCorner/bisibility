import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { normalizeResearchKeyword } from "@/lib/keyword-research/context";
import type { saveKeywordsSchema } from "@/lib/schemas/saved-keyword";
import type { z } from "zod";
import { type SavedKeywordRow, savedKeywordTrend } from "./model";

type SavedKeywordMutationScope = {
  actorId: string | null;
  projectId: string;
  projectPublicId: string;
};

type SaveRow = z.output<typeof saveKeywordsSchema>["rows"][number];
type RemoveInput = { publicIds: string[] } | { rows: Array<{ keyword: string; location: string }> };

const savedKeywordSelect = {
  cpc: true,
  difficulty: true,
  intent: true,
  location: true,
  publicId: true,
  savedAt: true,
  sourceSeed: true,
  text: true,
  trend: true,
  variantCount: true,
  volume: true,
} as const;

export async function listSavedKeywordRows(projectId: string): Promise<SavedKeywordRow[]> {
  const rows = await prisma.savedKeyword.findMany({
    orderBy: [{ volume: { nulls: "last", sort: "desc" } }, { savedAt: "desc" }, { id: "desc" }],
    select: savedKeywordSelect,
    where: { projectId },
  });
  return rows.map((row) => ({
    ...row,
    savedAt: row.savedAt.toISOString(),
    trend: savedKeywordTrend(row.trend),
  }));
}

export async function saveSavedKeywordRows(rows: SaveRow[], scope: SavedKeywordMutationScope) {
  const candidates = rows.map((row) => ({
    cpc: row.cpcCents == null ? null : row.cpcCents / 100,
    difficulty: row.difficulty ?? null,
    intent: row.intent ?? null,
    location: row.location,
    normalizedText: normalizeResearchKeyword(row.keyword),
    projectId: scope.projectId,
    publicId: makePublicId("svkw"),
    sourceSeed: row.sourceSeed ?? null,
    text: row.keyword,
    trend: row.monthlyTrend ?? undefined,
    variantCount: row.variantCount,
    volume: row.searchVolume ?? null,
  }));
  const { createdRows, result } = await prisma.$transaction(
    async (tx) => {
      const trackedRows = await tx.keyword.findMany({
        select: { text: true },
        where: { projectId: scope.projectId },
      });
      const tracked = new Set(trackedRows.map((row) => normalizeResearchKeyword(row.text)));
      const saveableRows = candidates.filter((row) => !tracked.has(row.normalizedText));
      if (saveableRows.length === 0) return { createdRows: [], result: { count: 0 } };

      const result = await tx.savedKeyword.createMany({
        data: saveableRows,
        skipDuplicates: true,
      });
      const createdRows =
        result.count > 0
          ? await tx.savedKeyword.findMany({
              select: { publicId: true },
              where: {
                projectId: scope.projectId,
                publicId: { in: saveableRows.map((row) => row.publicId) },
              },
            })
          : [];
      return { createdRows, result };
    },
    { isolationLevel: "Serializable" },
  );
  const createdIds = new Set(createdRows.map((row) => row.publicId));
  const results = candidates.map((row) => ({
    keyword: row.text,
    status: createdIds.has(row.publicId) ? ("created" as const) : ("skipped" as const),
  }));
  const outcome = {
    created: candidates.flatMap((row) =>
      createdIds.has(row.publicId) ? [{ keyword: row.text, publicId: row.publicId }] : [],
    ),
    duplicateCount: rows.length - result.count,
    results,
    savedCount: result.count,
  };
  await writeAudit({
    action: "saved_keyword.save",
    actorId: scope.actorId,
    after: {
      duplicateCount: outcome.duplicateCount,
      savedCount: outcome.savedCount,
    },
    projectId: scope.projectId,
    targetId: requiredPublicAuditId(scope.projectPublicId, "prj", "Project"),
    targetType: "project",
  });
  return outcome;
}

export async function removeSavedKeywordRows(data: RemoveInput, scope: SavedKeywordMutationScope) {
  const where =
    "publicIds" in data
      ? { projectId: scope.projectId, publicId: { in: data.publicIds } }
      : {
          OR: data.rows.map((row) => ({
            location: row.location,
            normalizedText: normalizeResearchKeyword(row.keyword),
          })),
          projectId: scope.projectId,
        };
  const removedCount = await prisma.$transaction(async (tx) => {
    const result = await tx.savedKeyword.deleteMany({ where });
    await writeAudit(
      {
        action: "saved_keyword.remove",
        actorId: scope.actorId,
        before: "publicIds" in data ? { publicIds: data.publicIds } : { rows: data.rows },
        projectId: scope.projectId,
        targetId: requiredPublicAuditId(scope.projectPublicId, "prj", "Project"),
        targetType: "project",
      },
      tx,
    );
    return result.count;
  });
  return { removedCount };
}
