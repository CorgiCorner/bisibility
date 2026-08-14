import "server-only";

import {
  buildCheckRunsView,
  type CheckRunsViewOptions,
  checkRangeStart,
  checkRunsPageLimit,
} from "@/lib/checks/runs-view";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { requireReadableProject } from "./_auth";
import { loadCheckRunsSummary } from "./check-runs-stats";
import { getRequestSerpProviderChain } from "./workspace-request-data";

const STALE_AFTER_MS = 48 * 60 * 60 * 1000;

function statusWhere(status: CheckRunsViewOptions["status"]): Prisma.RankCheckWhereInput {
  if (status === "fallback") return { status: "completed", viaFallback: true };
  if (status && status !== "all") return { status };
  return { status: { in: ["completed", "failed", "running"] } };
}

export function checkRunRowsWhere(
  projectId: string,
  rangeStart: Date,
  now: Date,
  options: CheckRunsViewOptions,
): Prisma.RankCheckWhereInput {
  const cursorAt = options.cursor ? new Date(options.cursor.checkedAt) : null;
  const cursor =
    cursorAt && Number.isFinite(cursorAt.getTime()) && options.cursor
      ? {
          OR: [
            { checkedAt: { lt: cursorAt } },
            { checkedAt: cursorAt, publicId: { lt: options.cursor.id } },
          ],
        }
      : {};

  return {
    checkedAt: { gte: rangeStart, lte: now },
    keyword: { projectId },
    ...statusWhere(options.status),
    ...(options.provider && options.provider !== "all" ? { provider: options.provider } : {}),
    ...(options.trigger && options.trigger !== "all" ? { trigger: options.trigger } : {}),
    ...cursor,
  };
}

export async function getCheckRunsView(projectId: string, options: CheckRunsViewOptions = {}) {
  const now = options.now ?? new Date();
  const range = options.range ?? "7d";
  const rangeStart = checkRangeStart(range, now);
  const limit = checkRunsPageLimit(options.limit);
  const { project } = await requireReadableProject(projectId);
  const providerChain = getRequestSerpProviderChain(project.id);
  const staleBefore = new Date(now.getTime() - STALE_AFTER_MS);
  const [rows, summary, staleCount] = await Promise.all([
    prisma.rankCheck.findMany({
      orderBy: [{ checkedAt: "desc" }, { publicId: "desc" }],
      select: {
        attemptCount: true,
        attempts: true,
        checkedAt: true,
        costCents: true,
        degradedToCountry: true,
        error: true,
        estimatedCostCents: true,
        finishedAt: true,
        publicId: true,
        keyword: {
          select: {
            publicId: true,
            text: true,
            device: true,
            locationRef: {
              select: {
                countryCode: true,
                displayName: true,
                languageCode: true,
                languageLabel: true,
              },
            },
          },
        },
        position: true,
        previousPosition: true,
        provider: true,
        requestedDepth: true,
        startedAt: true,
        status: true,
        trigger: true,
        viaFallback: true,
      },
      take: limit + 1,
      where: checkRunRowsWhere(project.id, rangeStart, now, options),
    }),
    loadCheckRunsSummary(project.id, { end: now, start: rangeStart }, providerChain),
    prisma.keyword.count({
      where: {
        dispatchState: { isNot: null },
        projectId: project.id,
        rankChecks: {
          none: { checkedAt: { gte: staleBefore }, status: "completed" },
          some: { checkedAt: { lt: staleBefore }, status: "completed" },
        },
      },
    }),
  ]);

  return buildCheckRunsView(rows, summary, { limit, staleCount });
}

export type { CheckRunsViewOptions };
