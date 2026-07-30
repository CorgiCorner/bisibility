"use server";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { normalizeResearchKeyword } from "@/lib/keyword-research/context";
import { appPath } from "@/lib/routing/app-path";
import { removeSavedKeywordsSchema, saveKeywordsSchema } from "@/lib/schemas/saved-keyword";
import { revalidatePath } from "next/cache";
import { getActionActor, makePublicId, parseActionInput, requireProjectScope } from "./_shared";

function revalidateSavedKeywords(projectRef: string) {
  revalidatePath(appPath(projectRef, "keywords"));
  revalidatePath(appPath(projectRef, "research"));
}

export async function saveKeywords(input: unknown) {
  const data = parseActionInput(saveKeywordsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "create", data.projectId, {
    type: "keyword",
  });
  const rows = data.rows.map((row) => ({
    cpc: row.cpcCents == null ? null : row.cpcCents / 100,
    difficulty: row.difficulty ?? null,
    intent: row.intent ?? null,
    location: row.location,
    normalizedText: normalizeResearchKeyword(row.keyword),
    projectId: project.id,
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
        where: { projectId: project.id },
      });
      const tracked = new Set(trackedRows.map((row) => normalizeResearchKeyword(row.text)));
      const saveableRows = rows.filter((row) => !tracked.has(row.normalizedText));
      if (saveableRows.length === 0) {
        return { createdRows: [], result: { count: 0 } };
      }
      const result = await tx.savedKeyword.createMany({
        data: saveableRows,
        skipDuplicates: true,
      });
      const createdRows =
        result.count > 0
          ? await tx.savedKeyword.findMany({
              select: { publicId: true },
              where: {
                projectId: project.id,
                publicId: { in: saveableRows.map((row) => row.publicId) },
              },
            })
          : [];
      return { createdRows, result };
    },
    { isolationLevel: "Serializable" },
  );
  const createdIds = new Set(createdRows.map((row) => row.publicId));
  const outcome = {
    created: rows.flatMap((row) =>
      createdIds.has(row.publicId) ? [{ keyword: row.text, publicId: row.publicId }] : [],
    ),
    duplicateCount: data.rows.length - result.count,
    savedCount: result.count,
  };
  await writeAudit({
    action: "saved_keyword.save",
    actorId: actor.id,
    after: { duplicateCount: outcome.duplicateCount, savedCount: outcome.savedCount },
    projectId: project.id,
    targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
    targetType: "project",
  });
  revalidateSavedKeywords(project.publicId);
  return outcome;
}

export async function removeSavedKeywords(input: unknown) {
  const data = parseActionInput(removeSavedKeywordsSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "delete", data.projectId, {
    type: "keyword",
  });
  const where =
    "publicIds" in data
      ? { projectId: project.id, publicId: { in: data.publicIds } }
      : {
          OR: data.rows.map((row) => ({
            location: row.location,
            normalizedText: normalizeResearchKeyword(row.keyword),
          })),
          projectId: project.id,
        };
  const removedCount = await prisma.$transaction(async (tx) => {
    const result = await tx.savedKeyword.deleteMany({
      where,
    });
    await writeAudit(
      {
        action: "saved_keyword.remove",
        actorId: actor.id,
        before: "publicIds" in data ? { publicIds: data.publicIds } : { rows: data.rows },
        projectId: project.id,
        targetId: requiredPublicAuditId(project.publicId, "prj", "Project"),
        targetType: "project",
      },
      tx,
    );
    return result.count;
  });
  revalidateSavedKeywords(project.publicId);
  return { removedCount };
}
