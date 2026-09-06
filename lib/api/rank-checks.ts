import "server-only";

import { parseActionInput } from "@/lib/actions/_shared";
import { whereExecutedChecks } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import type { ApiContext } from "./context";
import { notFound } from "./context";
import { ApiInputError } from "./errors";
import { decodeCursor, encodeCursor, parseLimit, splitPage } from "./pagination";
import { requireApiPublicId } from "./public-id";
import { requestRankCheck } from "./rank-check-request";
import {
  RANK_CHECK_COMPLETED_STATUS,
  RANK_CHECK_FAILED_STATUS,
  RANK_CHECK_RUNNING_STATUS,
  rankCheckResource,
  rankCheckSelect,
} from "./resources";
import { listResponse, resourceResponse } from "./responses";
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

async function scopedKeyword(ctx: ApiContext, keywordId: string) {
  return prisma.keyword.findFirst({
    select: {
      id: true,
      project: { select: { domain: true, isSample: true } },
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

  return requestRankCheck(ctx, data, keyword);
}
