import "server-only";

import { parseActionInput } from "@/lib/actions/_shared";
import { writeAudit } from "@/lib/auth/audit";
import { whereExecutedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { ProviderChainError, runKeywordCheckWithFallback } from "@/lib/rank-check/fallback";
import { persistFailedRankCheck, RankCheckRunnerError } from "@/lib/rank-check/runner";
import { trackedProjectDomain } from "@/lib/schemas/project";
import {
  manualRankCheckWorkflowId,
  rankCheckSearchAttributes,
  startRankCheckWorkflow,
} from "@/lib/temporal/client";
import type { ApiContext } from "./context";
import { notFound } from "./context";
import { ApiInputError } from "./errors";
import { decodeCursor, encodeCursor, parseLimit, splitPage } from "./pagination";
import { requireApiPublicId } from "./public-id";
import {
  RANK_CHECK_COMPLETED_STATUS,
  RANK_CHECK_FAILED_STATUS,
  RANK_CHECK_RUNNING_STATUS,
  rankCheckResource,
  rankCheckSelect,
} from "./resources";
import { errorResponse, listResponse, resourceResponse } from "./responses";
import { runRankCheckSchema } from "./schemas";

function statusFilter(url: URL) {
  const status = url.searchParams.get("status");
  if (status === RANK_CHECK_FAILED_STATUS) {
    return { status: RANK_CHECK_FAILED_STATUS };
  }
  if (status === RANK_CHECK_COMPLETED_STATUS) {
    return { status: RANK_CHECK_COMPLETED_STATUS };
  }
  if (status === RANK_CHECK_RUNNING_STATUS) {
    return { status: RANK_CHECK_RUNNING_STATUS };
  }
  return whereExecutedChecks();
}

function dateFilter(url: URL) {
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  const sinceDate = since ? new Date(since) : null;
  const untilDate = until ? new Date(until) : null;
  if (
    (sinceDate && Number.isNaN(sinceDate.getTime())) ||
    (untilDate && Number.isNaN(untilDate.getTime()))
  ) {
    throw new ApiInputError("since and until must be valid ISO-8601 date-times.");
  }

  return {
    ...(sinceDate ? { gte: sinceDate } : {}),
    ...(untilDate ? { lte: untilDate } : {}),
  };
}

function asyncRequested(url: URL) {
  const value = url.searchParams.get("async");
  if (value === null) {
    return false;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw new ApiInputError("async must be true or false.");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Rank check failed.";
}

async function writeFailureAudit(input: Parameters<typeof writeAudit>[0]) {
  try {
    await writeAudit(input);
  } catch {
    return undefined;
  }
}

async function scopedKeyword(ctx: ApiContext, keywordId: string) {
  return prisma.keyword.findFirst({
    select: {
      id: true,
      project: { select: { domain: true } },
      projectId: true,
      publicId: true,
      text: true,
    },
    where: { projectId: ctx.auth.project.id, publicId: keywordId },
  });
}

export async function listRankChecks(ctx: ApiContext, keywordId: string) {
  const keyword = await scopedKeyword(ctx, keywordId);
  if (!keyword) {
    return notFound(ctx, "Keyword not found.");
  }

  const limit = parseLimit(ctx.url, 50, 200);
  const cursor = decodeCursor(ctx.url.searchParams.get("cursor"), "check");
  const checkedAt = dateFilter(ctx.url);
  const rankChecks = await prisma.rankCheck.findMany({
    orderBy: [{ checkedAt: "desc" }, { publicId: "desc" }],
    select: rankCheckSelect,
    take: limit + 1,
    where: {
      AND: [
        { checkedAt },
        ...(cursor
          ? [
              {
                OR: [
                  { checkedAt: { lt: new Date(cursor.t) } },
                  { checkedAt: new Date(cursor.t), publicId: { lt: cursor.public_id } },
                ],
              },
            ]
          : []),
      ],
      keywordId: keyword.id,
      ...statusFilter(ctx.url),
    },
  });
  const { nextCursor, page } = splitPage(rankChecks, limit, (check) =>
    encodeCursor(
      {
        publicId: requireApiPublicId(check.publicId, "check"),
        timestamp: check.checkedAt,
      },
      "check",
    ),
  );

  return listResponse(page.map(rankCheckResource), nextCursor, { headers: ctx.headers });
}

export async function getRankCheck(ctx: ApiContext, checkId: string) {
  const publicId = requireApiPublicId(checkId, "check");
  const check = await prisma.rankCheck.findFirst({
    select: rankCheckSelect,
    where: {
      publicId,
      keyword: { projectId: ctx.auth.project.id },
      ...whereExecutedChecks(),
    },
  });
  if (!check) {
    return notFound(ctx, "Rank check not found.");
  }

  return resourceResponse(rankCheckResource(check), { headers: ctx.headers });
}

export async function runRankCheck(ctx: ApiContext, keywordId: string) {
  const rawBody = await ctx.req.text();
  const body = rawBody ? JSON.parse(rawBody) : {};
  const data = parseActionInput(runRankCheckSchema, body ?? {});
  const keyword = await scopedKeyword(ctx, keywordId);
  if (!keyword) {
    return notFound(ctx, "Keyword not found.");
  }

  if (asyncRequested(ctx.url)) {
    const rankCheck = await prisma.rankCheck.create({
      data: {
        attemptCount: 0,
        degradedToCountry: false,
        keywordId: keyword.id,
        normalizationVersion: null,
        publicId: makePublicId("check"),
        provider: data.provider_id ?? "primary",
        status: RANK_CHECK_RUNNING_STATUS,
        viaFallback: false,
      },
      select: rankCheckSelect,
    });
    const rankCheckPublicId = requireApiPublicId(rankCheck.publicId ?? "", "check");

    try {
      await startRankCheckWorkflow(
        {
          keywordId: keyword.id,
          providerId: data.provider_id,
          rankCheckId: rankCheck.id,
        },
        {
          searchAttributes: rankCheckSearchAttributes({
            keywordId: keyword.id,
            projectId: ctx.auth.project.id,
            provider: data.provider_id,
          }),
          workflowId: manualRankCheckWorkflowId(keyword.id),
        },
      );
    } catch {
      await prisma.rankCheck.delete({ where: { id: rankCheck.id } }).catch(() => undefined);
      await writeFailureAudit({
        action: "rank_check.requested",
        actorId: null,
        after: {
          keywordId: keyword.publicId,
          provider: data.provider_id ?? "primary",
          rankCheckId: rankCheckPublicId,
        },
        projectId: ctx.auth.project.id,
        status: "failed",
        statusReason: "Rank check scheduler is unavailable.",
        targetId: keyword.publicId,
        targetType: "keyword",
      });
      return errorResponse("scheduler_unavailable", "Rank check scheduler is unavailable.", 503, {
        headers: ctx.headers,
        instance: ctx.instance,
      });
    }

    await writeAudit({
      action: "rank_check.requested",
      actorId: null,
      after: {
        keywordId: keyword.publicId,
        provider: data.provider_id ?? "primary",
        rankCheckId: rankCheckPublicId,
      },
      projectId: ctx.auth.project.id,
      targetId: rankCheckPublicId,
      targetType: "rank_check",
    });

    return resourceResponse(rankCheckResource(rankCheck), {
      headers: ctx.headers,
      status: 202,
    });
  }

  let result: Awaited<ReturnType<typeof runKeywordCheckWithFallback>>;
  try {
    result = await runKeywordCheckWithFallback({
      keywordId: keyword.id,
      providerId: data.provider_id,
    });
  } catch (error) {
    if (error instanceof RankCheckRunnerError && error.code === "provider_failed") {
      await persistFailedRankCheck({
        attempts: error instanceof ProviderChainError ? error.attempts : undefined,
        error: error.message,
        keywordId: keyword.id,
        keywordPublicId: keyword.publicId,
        keywordText: keyword.text,
        projectDomain: trackedProjectDomain(keyword.project.domain) ?? "",
        projectId: ctx.auth.project.id,
        provider: data.provider_id ?? "unknown",
      }).catch(() => undefined);
    }
    await writeFailureAudit({
      action: "rank_check.run_now",
      actorId: null,
      after: { keywordId: keyword.publicId, provider: data.provider_id ?? "primary" },
      projectId: ctx.auth.project.id,
      status: "failed",
      statusReason: errorMessage(error),
      targetId: keyword.publicId,
      targetType: "keyword",
    });
    throw error;
  }
  await writeAudit({
    action: "rank_check.run_now",
    actorId: null,
    after: {
      keywordId: keyword.publicId,
      position: result.rankCheck.position,
      provider: result.rankCheck.provider,
    },
    projectId: ctx.auth.project.id,
    targetId: requireApiPublicId(result.rankCheck.publicId ?? "", "check"),
    targetType: "rank_check",
  });

  return resourceResponse(rankCheckResource({ ...result.rankCheck, keyword }), {
    headers: ctx.headers,
    status: 201,
  });
}
