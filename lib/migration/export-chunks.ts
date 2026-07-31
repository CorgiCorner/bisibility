import "server-only";

import { whereCompletedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { requirePublicId } from "@/lib/db/public-id";
import { CHUNK_MAX_HISTORY_ROWS, CHUNK_TARGET_KEYWORDS } from "@/lib/migration/limits";
import { requireRankNormalizationVersion } from "@/lib/rank-check/normalization-version";

const preferenceSelect = {
  alertEmail: true,
  alertInApp: true,
  checkEmail: true,
  checkInApp: true,
  importEmail: true,
  importInApp: true,
  inviteEmail: true,
  inviteInApp: true,
  reportEmail: true,
};

type ExportKeywordChunkInput = {
  cursor?: string | null;
  maxHistoryRows?: number;
  maxKeywords?: number;
  projectId: string;
};

type ExportSectionsChunkInput = {
  projectId: string;
  userId: string;
};

function positiveLimit(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function rankHistory(checks: KeywordRow["rankChecks"]) {
  return checks.map((check) => ({
    checkedAt: check.checkedAt.toISOString(),
    normalizationVersion: requireRankNormalizationVersion(check.normalizationVersion),
    position: check.position,
    previousPosition: check.previousPosition,
    provider: check.provider,
    rankingUrl: check.rankingUrl,
    requestedDepth: check.requestedDepth,
  }));
}

function packageKeyword(keyword: KeywordRow) {
  return {
    device: keyword.device,
    id: requirePublicId(keyword.publicId, "kw"),
    keyword: keyword.text,
    location: keyword.location,
    rankingHistory: rankHistory(keyword.rankChecks),
    tags: keyword.tags.map((item) => item.tag.name),
    target_url: keyword.targetUrl,
  };
}

function shouldStopChunk(
  selected: KeywordRow[],
  historyRows: number,
  nextRows: number,
  maxKeywords: number,
  maxHistoryRows: number,
) {
  if (selected.length >= maxKeywords) return true;
  return selected.length > 0 && historyRows + nextRows > maxHistoryRows;
}

export async function exportKeywordChunk(input: ExportKeywordChunkInput) {
  const maxKeywords = positiveLimit(input.maxKeywords, CHUNK_TARGET_KEYWORDS);
  const maxHistoryRows = positiveLimit(input.maxHistoryRows, CHUNK_MAX_HISTORY_ROWS);
  const rows = await prisma.keyword.findMany({
    include: {
      rankChecks: {
        orderBy: { checkedAt: "desc" },
        where: whereCompletedChecks(),
      },
      tags: { include: { tag: true } },
    },
    orderBy: { publicId: "asc" },
    take: maxKeywords + 1,
    where: {
      projectId: input.projectId,
      ...(input.cursor ? { publicId: { gt: input.cursor } } : {}),
    },
  });
  const selected: KeywordRow[] = [];
  let historyRows = 0;

  for (const row of rows) {
    const nextRows = row.rankChecks.length;
    if (shouldStopChunk(selected, historyRows, nextRows, maxKeywords, maxHistoryRows)) break;
    selected.push(row);
    historyRows += nextRows;
    if (selected.length === 1 && nextRows > maxHistoryRows) break;
  }

  const last = selected.at(-1);
  return {
    done: selected.length === rows.length,
    keywords: selected.map(packageKeyword),
    nextCursor: last?.publicId ?? null,
  };
}

export async function countKeywordChunks(input: ExportKeywordChunkInput) {
  const maxKeywords = positiveLimit(input.maxKeywords, CHUNK_TARGET_KEYWORDS);
  const maxHistoryRows = positiveLimit(input.maxHistoryRows, CHUNK_MAX_HISTORY_ROWS);
  const rows = await prisma.keyword.findMany({
    orderBy: { publicId: "asc" },
    select: {
      _count: {
        select: { rankChecks: { where: whereCompletedChecks() } },
      },
      publicId: true,
    },
    where: { projectId: input.projectId },
  });
  let chunks = 0;
  let currentKeywords = 0;
  let currentRows = 0;
  const flush = () => {
    if (currentKeywords > 0) chunks += 1;
    currentKeywords = 0;
    currentRows = 0;
  };

  for (const row of rows) {
    const rowsForKeyword = row._count.rankChecks;
    if (
      currentKeywords > 0 &&
      (currentKeywords >= maxKeywords || currentRows + rowsForKeyword > maxHistoryRows)
    ) {
      flush();
    }
    currentKeywords += 1;
    currentRows += rowsForKeyword;
    if (rowsForKeyword > maxHistoryRows) flush();
  }
  flush();
  return chunks;
}

function sourceKeywordIds(rows: SourceKeywordRow[]) {
  return Object.fromEntries(
    rows.map((keyword) => [
      requirePublicId(keyword.publicId, "kw"),
      { device: keyword.device, location: keyword.location, text: keyword.text },
    ]),
  );
}

export async function exportSectionsChunk({ projectId, userId }: ExportSectionsChunkInput) {
  const [alertRules, competitors, savedViews, preference, keywords] = await Promise.all([
    prisma.alertRule.findMany({
      include: {
        targets: {
          include: {
            keyword: { select: { device: true, location: true, publicId: true, text: true } },
            tag: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      where: { projectId },
    }),
    prisma.competitor.findMany({
      orderBy: { createdAt: "desc" },
      select: { domain: true, label: true, publicId: true },
      where: { projectId },
    }),
    prisma.savedView.findMany({
      orderBy: { createdAt: "desc" },
      select: { config: true, name: true, publicId: true, surface: true },
      where: { projectId },
    }),
    prisma.notificationPreference.findUnique({
      select: preferenceSelect,
      where: { userId_projectId: { projectId, userId } },
    }),
    prisma.keyword.findMany({
      orderBy: { publicId: "asc" },
      select: { device: true, location: true, publicId: true, text: true },
      where: { projectId },
    }),
  ]);
  const notificationPreferences = preference ? [preference] : [];

  return {
    alert_rules: alertRules.map((rule) => ({
      change_pct: rule.changePct == null ? null : Number(rule.changePct),
      channels: rule.channels,
      competitor_domain: rule.competitorDomain,
      condition_type: rule.conditionType,
      drop_positions: rule.dropPositions,
      enabled: rule.enabled,
      id: requirePublicId(rule.publicId, "alr"),
      name: rule.name,
      serp_feature: rule.serpFeature,
      severity: rule.severity,
      target_type: rule.targetType,
      targets: rule.targets.flatMap((target): Record<string, unknown>[] => {
        if (target.keyword)
          return [
            {
              device: target.keyword.device,
              keyword: target.keyword.text,
              keyword_id: requirePublicId(target.keyword.publicId, "kw"),
              location: target.keyword.location,
              type: "keyword",
            },
          ];
        if (target.tag) return [{ tag: target.tag.name, type: "tag" }];
        return [];
      }),
      threshold_position: rule.thresholdPosition,
      top_n: rule.topN,
    })),
    competitors: competitors.map(({ publicId, ...competitor }) => ({
      ...competitor,
      id: requirePublicId(publicId, "cmp"),
    })),
    notification_preferences: notificationPreferences.map((item) => ({
      alert_email: item.alertEmail,
      alert_in_app: item.alertInApp,
      check_email: item.checkEmail,
      check_in_app: item.checkInApp,
      import_email: item.importEmail,
      import_in_app: item.importInApp,
      invite_email: item.inviteEmail,
      invite_in_app: item.inviteInApp,
      report_email: item.reportEmail,
    })),
    saved_views: savedViews.map(({ publicId, ...view }) => ({
      ...view,
      id: requirePublicId(publicId, "viw"),
    })),
    source_keyword_ids: sourceKeywordIds(keywords),
  };
}

type KeywordRow = Awaited<ReturnType<typeof prisma.keyword.findMany>>[number] & {
  rankChecks: {
    checkedAt: Date;
    normalizationVersion: string | null;
    position: number | null;
    previousPosition: number | null;
    provider: string;
    rankingUrl: string | null;
    requestedDepth: number | null;
  }[];
  tags: { tag: { name: string } }[];
};

type SourceKeywordRow = {
  device: string;
  location: string;
  publicId: string;
  text: string;
};
