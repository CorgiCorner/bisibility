import "server-only";

import { ApiInputError, ApiNotFoundError } from "@/lib/api/errors";
import {
  decodeCursor,
  decodeUnprefixedCursor,
  encodeCursor,
  encodeUnprefixedCursor,
  parseLimit,
  splitPage,
} from "@/lib/api/pagination";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getRequestMonthlySpendCents } from "@/lib/queries/workspace-request-data";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { activeMarketLocationIds, runnableKeywordWhere } from "@/lib/rank-check/runnable";
import { ITEM_STATUSES, type ItemStatus, RUN_STATUSES } from "@/lib/rank-check/runs/contract";
import { scheduledRunProjection, scheduleProviderId } from "./check-schedule-list";
import {
  type RankCheckRunActor,
  type RankCheckRunRow,
  rankCheckRunDto,
  rankCheckRunSelect,
} from "./rank-check-run-dto";
import {
  findHistoryRunRows,
  skippedByRunPublicId,
  wasSkippedBeforeLaunch,
} from "./rank-check-run-history";
import { budgetForRuns, iso, statusCsv } from "./rank-check-run-query-helpers";

async function rankCheckRunReadModel(
  row: RankCheckRunRow,
  skippedBy: RankCheckRunActor | null = null,
  budget: { capCents: number; spentCents: number } | null = null,
) {
  const dto = { ...rankCheckRunDto(row, budget), skippedBy };
  const needsScheduleProjection =
    row.status === "planned" ||
    (row.status === "blocked" && row.launchedAt === null) ||
    wasSkippedBeforeLaunch(row);
  if (!needsScheduleProjection || !row.checkSchedule) return dto;

  const activeLocationIds = await activeMarketLocationIds(row.projectId, prisma);
  const keywords = await prisma.keyword.findMany({
    select: { device: true, locationId: true, text: true },
    where: {
      ...runnableKeywordWhere(activeLocationIds),
      checkScheduleId: row.checkSchedule.id,
    },
  });
  const providers = await loadSerpProviderChain(
    row.projectId,
    scheduleProviderId(row.checkSchedule.providerPolicy),
  );
  const projection = scheduledRunProjection(
    { ...row.checkSchedule, keywords },
    row.project.defaults?.serpDepth,
    providers[0],
  );
  return {
    ...dto,
    counts: {
      cancelled: 0,
      completed: 0,
      deferred: 0,
      failed: 0,
      requested: projection.targetCount,
      skipped: 0,
      total: projection.targetCount,
    },
    estimatedCostCents: projection.estimatedCostCents ?? 0,
    keywordCount: projection.keywordCount,
    targetCount: projection.targetCount,
  };
}

export async function listRankCheckRuns(projectId: string, url: URL) {
  const segment = url.searchParams.get("segment") ?? "history";
  if (segment !== "history" && segment !== "planned") {
    throw new ApiInputError("Segment must be history or planned.");
  }
  const limit = parseLimit(url, 50, 200);
  const cursor = decodeCursor(url.searchParams.get("cursor"), "rcr");
  const statuses = statusCsv(url.searchParams.get("status"), RUN_STATUSES);
  const cursorDate = cursor ? new Date(cursor.t) : null;
  const cursorId = cursor?.public_id;
  const history = segment === "history";
  const plannedStatuses = statuses?.filter(
    (candidate): candidate is "planned" | "blocked" =>
      candidate === "planned" || candidate === "blocked",
  );
  const status = history
    ? statuses
      ? { in: statuses }
      : undefined
    : { in: plannedStatuses ?? ["planned", "blocked"] };
  const keyset = cursorDate
    ? {
        OR: [
          { plannedFor: { gt: cursorDate } },
          { plannedFor: cursorDate, publicId: { gt: cursorId } },
        ],
      }
    : {};
  const rows = history
    ? await findHistoryRunRows(
        projectId,
        statuses,
        cursorDate && cursorId ? { id: cursorId, timestamp: cursorDate } : null,
        limit + 1,
      )
    : await prisma.rankCheckRun.findMany({
        orderBy: [{ plannedFor: "asc" }, { publicId: "asc" }],
        select: rankCheckRunSelect,
        take: limit + 1,
        where: {
          projectId,
          status,
          launchedAt: null,
          plannedFor: { not: null },
          ...keyset,
        },
      });
  const page = rows.slice(0, limit);
  const skippedBy = await skippedByRunPublicId(page);
  const budget = budgetForRuns(
    page,
    page.some((row) => row.blockedReason === "budget_exhausted")
      ? await getRequestMonthlySpendCents(projectId)
      : null,
  );
  const last = page.at(-1);
  const timestamp = last
    ? history
      ? (last.launchedAt ?? last.finishedAt)
      : last.plannedFor
    : null;
  const nextCursor =
    rows.length > limit && last && timestamp
      ? encodeCursor({ publicId: last.publicId, timestamp }, "rcr")
      : null;
  return {
    data: await Promise.all(
      page.map((row) => rankCheckRunReadModel(row, skippedBy.get(row.publicId) ?? null, budget)),
    ),
    nextCursor,
  };
}

export async function getRankCheckRunCount(projectId: string) {
  return prisma.rankCheckRun.count({ where: { launchedAt: { not: null }, projectId } });
}

export async function getRankCheckRun(projectId: string, publicId: string) {
  const row = await prisma.rankCheckRun.findFirst({
    select: rankCheckRunSelect,
    where: { projectId, publicId },
  });
  if (!row) throw new ApiNotFoundError("Rank-check run not found.");
  const skippedBy = await skippedByRunPublicId([row]);
  const budget = budgetForRuns(
    [row],
    row.blockedReason === "budget_exhausted" ? await getRequestMonthlySpendCents(projectId) : null,
  );
  return {
    ...(await rankCheckRunReadModel(row, skippedBy.get(row.publicId) ?? null, budget)),
    selectionSpec: row.selectionSpec,
  };
}

export async function getRankCheckRunCommand(projectId: string, publicId: string) {
  const row = await prisma.rankCheckRun.findFirst({
    select: { id: true, orchestrationWorkflowId: true, publicId: true, status: true },
    where: { projectId, publicId },
  });
  if (!row) throw new ApiNotFoundError("Rank-check run not found.");
  return row;
}

export async function getRetryParentRun(projectId: string, publicId: string) {
  const row = await prisma.rankCheckRun.findFirst({
    select: {
      id: true,
      items: {
        select: { id: true, keyword: { select: { id: true, publicId: true } }, status: true },
      },
      project: { select: { domain: true, id: true, isSample: true } },
      publicId: true,
      status: true,
    },
    where: { projectId, publicId },
  });
  if (!row) throw new ApiNotFoundError("Rank-check run not found.");
  return row;
}

export async function listRankCheckRunItems(projectId: string, publicId: string, url: URL) {
  const run = await prisma.rankCheckRun.findFirst({
    select: { id: true },
    where: { projectId, publicId },
  });
  if (!run) throw new ApiNotFoundError("Rank-check run not found.");
  const limit = parseLimit(url, 50, 200);
  const cursor = decodeUnprefixedCursor(url.searchParams.get("cursor"));
  const statuses = statusCsv(url.searchParams.get("status"), ITEM_STATUSES);
  const cursorDate = cursor ? new Date(cursor.t) : null;
  const cursorId = cursor?.public_id;
  const rows = await prisma.rankCheckRunItem.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      actualCostCents: true,
      blockedReason: true,
      createdAt: true,
      estimatedCostCents: true,
      finishedAt: true,
      id: true,
      keyword: {
        select: {
          device: true,
          location: true,
          locationRef: { select: { languageLabel: true } },
          publicId: true,
          text: true,
        },
      },
      notBefore: true,
      rankCheck: { select: { errorCode: true, position: true, publicId: true, rankingUrl: true } },
      startedAt: true,
      status: true,
    },
    take: limit + 1,
    where: {
      runId: run.id,
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(cursorDate
        ? {
            OR: [
              { createdAt: { gt: cursorDate } },
              { createdAt: cursorDate, id: { gt: cursorId } },
            ],
          }
        : {}),
    },
  });
  const { nextCursor, page } = splitPage(rows, limit, (row) =>
    encodeUnprefixedCursor({ publicId: row.id, timestamp: row.createdAt }),
  );
  return {
    data: page.map(({ createdAt, id, keyword: { locationRef, ...keyword }, ...row }) => ({
      ...row,
      finishedAt: iso(row.finishedAt),
      id: encodeUnprefixedCursor({ publicId: id, timestamp: createdAt }),
      keyword: { ...keyword, languageLabel: locationRef?.languageLabel ?? null },
      notBefore: iso(row.notBefore),
      startedAt: iso(row.startedAt),
      status: row.status as ItemStatus,
    })),
    nextCursor,
  };
}

function scheduleSelect(activeLocationIds: Iterable<string>) {
  return {
    _count: { select: { keywords: { where: runnableKeywordWhere(activeLocationIds) } } },
    cronExpression: true,
    enabled: true,
    frequency: true,
    isDefault: true,
    jitterMinutes: true,
    name: true,
    providerPolicy: true,
    publicId: true,
    serpDepth: true,
    timeOfDay: true,
    timezone: true,
  } satisfies Prisma.CheckScheduleSelect;
}

type ScheduleSource = Prisma.CheckScheduleGetPayload<{ select: ReturnType<typeof scheduleSelect> }>;

function scheduleDto(row: ScheduleSource) {
  const { _count, publicId, ...schedule } = row;
  return { ...schedule, keywordCount: _count.keywords, publicId };
}

export async function listCheckSchedules(projectId: string) {
  const activeLocationIds = await activeMarketLocationIds(projectId, prisma);
  const rows = await prisma.checkSchedule.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }, { publicId: "asc" }],
    select: scheduleSelect(activeLocationIds),
    where: { projectId },
  });
  return rows.map(scheduleDto);
}

export async function getCheckSchedule(projectId: string, publicId: string) {
  const activeLocationIds = await activeMarketLocationIds(projectId, prisma);
  const row = await prisma.checkSchedule.findFirst({
    select: scheduleSelect(activeLocationIds),
    where: { projectId, publicId },
  });
  if (!row) throw new ApiNotFoundError("Check schedule not found.");
  return scheduleDto(row);
}
