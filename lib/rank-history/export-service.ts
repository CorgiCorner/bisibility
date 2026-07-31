import "server-only";

import type { Actor } from "@/lib/auth/authorize";
import { authorize } from "@/lib/auth/authorize";
import { whereCompletedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";
import { auditKeywordExport } from "@/lib/keywords/export-audit";

export type RankHistoryExportOptions = {
  actor: Actor;
  auditActorId?: string | null;
  format: "csv" | "json" | "xlsx";
  granularity: "daily" | "weekly";
  keywordIds?: string[];
  projectId: string;
  range: "30" | "90" | "all";
};

function cutoff(range: RankHistoryExportOptions["range"]) {
  if (range === "all") return null;
  const value = new Date();
  value.setDate(value.getDate() - Number(range));
  return value;
}

function auditActorId(input: RankHistoryExportOptions) {
  return input.auditActorId === undefined ? input.actor.id : input.auditActorId;
}

function requiredPublicId(value: string | null, prefix: PublicIdPrefix, resource: string) {
  if (!value || parsePublicId(value)?.prefix !== prefix) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

export async function loadRankHistoryExport(input: RankHistoryExportOptions) {
  if (input.keywordIds?.some((keywordId) => parsePublicId(keywordId)?.prefix !== "kw")) {
    throw new Error("Keyword not found.");
  }
  const project = await prisma.project.findFirst({
    select: { id: true, publicId: true },
    where: { OR: [{ id: input.projectId }, { publicId: input.projectId }] },
  });
  if (!project) throw new Error("Project not found.");
  authorize(input.actor, "read", { projectId: project.id, type: "keyword" });

  const minDate = cutoff(input.range);
  const keywords =
    input.keywordIds?.length === 0
      ? []
      : await prisma.keyword.findMany({
          select: {
            createdAt: true,
            device: true,
            location: true,
            publicId: true,
            rankChecks: {
              orderBy: [{ checkedAt: "desc" }, { publicId: "desc" }],
              select: {
                checkedAt: true,
                normalizationVersion: true,
                position: true,
                previousPosition: true,
                provider: true,
                publicId: true,
                rankingUrl: true,
                requestedDepth: true,
              },
              where: {
                ...whereCompletedChecks(),
                ...(minDate ? { checkedAt: { gte: minDate } } : {}),
              },
            },
            tags: { select: { tag: { select: { name: true } } } },
            targetUrl: true,
            text: true,
            topic: true,
            intent: true,
          },
          orderBy: { createdAt: "desc" },
          where: {
            projectId: project.id,
            ...(input.keywordIds?.length ? { publicId: { in: input.keywordIds } } : {}),
          },
        });

  await auditKeywordExport(
    auditActorId(input),
    project.id,
    project.publicId,
    keywords.length,
    input.format,
    "history",
  );
  return { keywords, project };
}

type LoadedRankHistory = Awaited<ReturnType<typeof loadRankHistoryExport>>;

function weekKey(date: Date) {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - yearStart) / 86400000,
  );
  return `${date.getUTCFullYear()}-${Math.floor(day / 7)}`;
}

export function rankHistoryRows(
  loaded: LoadedRankHistory,
  granularity: RankHistoryExportOptions["granularity"],
) {
  const rows = loaded.keywords.flatMap((keyword) => {
    const keywordId = requiredPublicId(keyword.publicId, "kw", "Keyword");
    const weeks = new Set<string>();
    return keyword.rankChecks.flatMap((check) => {
      const id = requiredPublicId(check.publicId, "check", "Rank-check");
      const key = `${keywordId}:${weekKey(check.checkedAt)}`;
      if (granularity === "weekly" && weeks.has(key)) return [];
      weeks.add(key);
      return [
        {
          checkedAt: check.checkedAt,
          id,
          keyword: keyword.text,
          keywordId,
          normalizationVersion: check.normalizationVersion,
          position: check.position,
          previousPosition: check.previousPosition,
          provider: check.provider,
          rankingUrl: check.rankingUrl,
          requestedDepth: check.requestedDepth,
        },
      ];
    });
  });
  return rows.sort(
    (left, right) =>
      right.checkedAt.getTime() - left.checkedAt.getTime() || right.id.localeCompare(left.id),
  );
}

function csvCell(value: unknown) {
  const text =
    value === null || value === undefined
      ? ""
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function rankHistoryCsvLine(row: ReturnType<typeof rankHistoryRows>[number]) {
  return [
    row.keywordId,
    row.keyword,
    row.checkedAt,
    row.position,
    row.previousPosition,
    row.rankingUrl,
    row.provider,
    row.requestedDepth,
    row.normalizationVersion,
  ]
    .map(csvCell)
    .join(",");
}

export const rankHistoryCsvHeader =
  "keyword_id,keyword,checked_at,position,previous_position,ranking_url,provider,requested_depth,normalization_version";
