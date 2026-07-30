import "server-only";

import { prisma } from "@/lib/db/prisma";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const completedStatus = "completed";
const failedStatus = "failed";

export type WeeklyDigestData = {
  projectName: string;
  projectDomain: string;
  rangeStart: Date;
  rangeEnd: Date;
  topMovers: Array<{
    keyword: string;
    publicId: string;
    from: number | null;
    to: number | null;
    delta: number;
  }>;
  avgPositionDelta: number | null;
  failedChecksCount: number;
  checkedKeywords: number;
};

type WindowCheck = {
  checkedAt: Date;
  id: string;
  keyword: { publicId: string; text: string };
  keywordId: string;
  position: number | null;
  status: string;
};

type PreviousKeyword = {
  id: string;
  rankChecks: Array<{ position: number | null }>;
};

function weeklyRangeStart(now: Date) {
  return new Date(now.getTime() - WEEK_MS);
}

function latestCompletedByKeyword(checks: WindowCheck[]) {
  const latest = new Map<string, WindowCheck>();

  // Caller passes DB-ordered checks: checkedAt desc, id desc.
  for (const check of checks) {
    if (check.status === completedStatus && !latest.has(check.keywordId)) {
      latest.set(check.keywordId, check);
    }
  }

  return latest;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function previousByKeyword(keywords: PreviousKeyword[]) {
  const previous = new Map<string, number | null>();

  for (const keyword of keywords) {
    previous.set(keyword.id, keyword.rankChecks[0]?.position ?? null);
  }

  return previous;
}

function buildMovers(latest: Map<string, WindowCheck>, previousKeywords: PreviousKeyword[]) {
  const previous = previousByKeyword(previousKeywords);
  const movers = [...latest.values()].flatMap((check) => {
    const from = previous.get(check.keywordId) ?? null;
    const to = check.position;
    if (from === null || to === null) {
      return [];
    }

    return [
      {
        delta: from - to,
        from,
        keyword: check.keyword.text,
        publicId: check.keyword.publicId,
        to,
      },
    ];
  });

  movers.sort(
    (a, b) =>
      Math.abs(b.delta) - Math.abs(a.delta) ||
      b.delta - a.delta ||
      a.keyword.localeCompare(b.keyword),
  );
  return movers;
}

async function projectFor(projectId: string) {
  return prisma.project.findFirst({
    select: { domain: true, id: true, name: true },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
}

export async function collectWeeklyDigestData(
  projectId: string,
  now: Date,
): Promise<WeeklyDigestData | null> {
  const project = await projectFor(projectId);
  if (!project) {
    return null;
  }

  const rangeEnd = new Date(now);
  const rangeStart = weeklyRangeStart(rangeEnd);
  const windowChecks = await prisma.rankCheck.findMany({
    orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
    select: {
      checkedAt: true,
      id: true,
      keyword: { select: { publicId: true, text: true } },
      keywordId: true,
      position: true,
      status: true,
    },
    where: {
      checkedAt: { gte: rangeStart, lt: rangeEnd },
      keyword: { projectId: project.id },
      status: { in: [completedStatus, failedStatus] },
    },
  });
  const failedChecksCount = windowChecks.filter((check) => check.status === failedStatus).length;
  const latest = latestCompletedByKeyword(windowChecks);

  if (latest.size === 0 && failedChecksCount === 0) {
    return null;
  }

  const previousKeywords = latest.size
    ? await prisma.keyword.findMany({
        select: {
          id: true,
          rankChecks: {
            orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
            select: { position: true },
            take: 1,
            where: { checkedAt: { lt: rangeStart }, status: completedStatus },
          },
        },
        where: {
          id: { in: [...latest.keys()] },
          projectId: project.id,
        },
      })
    : [];
  const movers = buildMovers(latest, previousKeywords);

  return {
    avgPositionDelta: average(movers.map((mover) => mover.delta)),
    checkedKeywords: latest.size,
    failedChecksCount,
    projectDomain: project.domain,
    projectName: project.name,
    rangeEnd,
    rangeStart,
    topMovers: movers.slice(0, 5),
  };
}
