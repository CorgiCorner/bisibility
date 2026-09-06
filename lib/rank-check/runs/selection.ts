import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { Prisma } from "@/lib/generated/prisma/client";
import { rankTrackerExportQuerySchema } from "@/lib/keywords/keyword-export-contract";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { resolveRankTrackerExportKeywordIdsForProject } from "@/lib/queries/rank-tracker-selection-core";
import { ACTIVE_QUEUED_TASK_STATES } from "@/lib/rank-check/queued-state";
import { z } from "zod";
import { SELECTION_KINDS } from "./contract";

const keywordPublicIdSchema = z
  .string()
  .refine((value) => isPublicIdOfType(value, "kw"), "Keyword not found.");

export const runSelectionSpecSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal(SELECTION_KINDS[0]),
      keywordId: keywordPublicIdSchema,
      v: z.literal(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal(SELECTION_KINDS[1]),
      keywordIds: z
        .array(keywordPublicIdSchema)
        .min(1)
        .max(1_000)
        .refine((ids) => new Set(ids).size === ids.length, "Keyword IDs must be unique."),
      v: z.literal(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal(SELECTION_KINDS[2]),
      query: rankTrackerExportQuerySchema,
      v: z.literal(1),
    })
    .strict(),
  z.object({ kind: z.literal(SELECTION_KINDS[3]), v: z.literal(1) }).strict(),
]);

export type RunSelectionSpec = z.infer<typeof runSelectionSpecSchema>;
export type ResolvedRunSelection = { keywordIds: string[]; selectionHash: string };
type SelectionProject = { domain: string | null; id: string };

export const runSelectionKeywordSelect = {
  archivedAt: true,
  id: true,
  locationId: true,
  queuedRankCheckTasks: {
    select: { state: true },
    take: 1,
    where: { state: { in: ACTIVE_QUEUED_TASK_STATES } },
  },
  rankCheckRunItems: {
    select: { status: true },
    take: 1,
    where: {
      run: { status: { in: ["queued", "running"] } },
      status: { in: ["queued", "running"] },
    },
  },
  rankChecks: {
    orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
    select: { status: true },
    take: 1,
  },
  schedule: { select: { serpDepth: true } },
  text: true,
} satisfies Prisma.KeywordSelect;

export type RunSelectionKeyword = Prisma.KeywordGetPayload<{
  select: typeof runSelectionKeywordSelect;
}>;

export function runSelectionKeywordInProgress(row: RunSelectionKeyword) {
  return (
    row.rankCheckRunItems.length > 0 ||
    row.queuedRankCheckTasks.length > 0 ||
    row.rankChecks[0]?.status === "running"
  );
}

export async function lockRunSelectionKeywords(
  tx: Prisma.TransactionClient,
  projectId: string,
  keywordIds: string[],
) {
  if (keywordIds.length === 0) return [];
  await tx.$queryRaw(Prisma.sql`
    SELECT k.id
    FROM "keywords" k
    WHERE k."projectId" = ${projectId} AND k.id IN (${Prisma.join(keywordIds)})
    ORDER BY k.id
    FOR UPDATE OF k
  `);
  return tx.keyword.findMany({
    orderBy: { id: "asc" },
    select: runSelectionKeywordSelect,
    where: { id: { in: keywordIds }, projectId },
  });
}

function selectionHash(keywordIds: readonly string[]) {
  return createHash("sha256").update(keywordIds.join("\n")).digest("hex");
}

function selectedKeywordIdsWhere(projectId: string, keywordIds: readonly string[]) {
  if (keywordIds.some((keywordId) => !isPublicIdOfType(keywordId, "kw"))) {
    throw new Error("Keyword not found.");
  }
  return { projectId, publicId: { in: [...keywordIds] } };
}

async function selectedInternalIds(projectId: string, publicIds: string[]) {
  if (publicIds.length === 0) return [];
  const rows = await prisma.keyword.findMany({
    select: { id: true },
    where: selectedKeywordIdsWhere(projectId, publicIds),
  });
  return rows.map(({ id }) => id);
}

async function filteredInternalIds(project: SelectionProject, query: RankTrackerQueryState) {
  const publicIds = await resolveRankTrackerExportKeywordIdsForProject(project, query, {
    membershipLimit: null,
  });
  return selectedInternalIds(project.id, publicIds);
}

async function unresolvedIds(project: SelectionProject, spec: RunSelectionSpec) {
  if (spec.kind === "all") {
    return (
      await prisma.keyword.findMany({ select: { id: true }, where: { projectId: project.id } })
    ).map(({ id }) => id);
  }
  if (spec.kind === "filter") {
    return filteredInternalIds(project, spec.query);
  }
  return selectedInternalIds(
    project.id,
    spec.kind === "single" ? [spec.keywordId] : spec.keywordIds,
  );
}

export async function resolveRunSelection(
  project: SelectionProject,
  spec: RunSelectionSpec,
): Promise<ResolvedRunSelection> {
  const keywordIds = [...new Set(await unresolvedIds(project, spec))].sort();
  return { keywordIds, selectionHash: selectionHash(keywordIds) };
}
