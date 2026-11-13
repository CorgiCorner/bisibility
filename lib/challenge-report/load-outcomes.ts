import "server-only";

import { AI_RESEARCH_PROVIDER_ID } from "@/lib/ai-research/catalog-types";
import { getConversionSources, getConversionTotals } from "@/lib/conversions/queries";
import { prisma } from "@/lib/db/prisma";
import { dateFromKey } from "@/lib/search-insights/dates";
import type { ChallengePeriod } from "./period";
import { unavailableTile } from "./tile-state";
import {
  activeDaysTileFor,
  buildAiAnswersTile,
  buildConversionsTile,
  buildTop10Tile,
} from "./tiles-outcomes";

function asDate(period: ChallengePeriod) {
  return { from: dateFromKey(period.from), to: dateFromKey(period.to) };
}

export async function loadActiveDaysTile(actorId: string, period: ChallengePeriod) {
  if (!actorId) return unavailableTile("no_data", "no_actor");
  const state = await prisma.achievementState.findUnique({
    select: { epoch: true },
    where: { userId: actorId },
  });
  if (!state) {
    return activeDaysTileFor({
      activeDates: [],
      from: period.from,
      to: period.to,
      tracked: false,
    });
  }
  const rows = await prisma.achievementDay.findMany({
    select: { localDay: true },
    where: {
      epoch: state.epoch,
      kind: "practice",
      localDay: { gte: period.from, lte: period.to },
      userId: actorId,
    },
  });
  return activeDaysTileFor({
    activeDates: rows.map((row) => row.localDay),
    from: period.from,
    to: period.to,
    tracked: true,
  });
}

export async function loadAiAnswersTile(projectId: string, period: ChallengePeriod) {
  const end = new Date(`${period.to}T23:59:59.999Z`);
  const [project, prompts, samples, connection] = await Promise.all([
    prisma.project.findUnique({
      select: { brandAliases: true, brandExcludedNames: true, domain: true, name: true },
      where: { id: projectId },
    }),
    prisma.aiPrompt.findMany({
      select: {
        id: true,
        revisions: { orderBy: { ordinal: "desc" }, select: { text: true }, take: 1 },
      },
      take: 200,
      where: { archivedAt: null, projectId },
    }),
    prisma.aiTrackingSample.findMany({
      orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
      select: {
        answerText: true,
        engine: true,
        finishedAt: true,
        promptRevision: { select: { promptId: true } },
      },
      take: 2_000,
      where: {
        answerText: { not: null },
        finishedAt: { lte: end },
        measurement: "answer_present",
        projectId,
      },
    }),
    prisma.providerConnection.findFirst({
      select: { id: true },
      where: {
        enabled: true,
        projectId,
        provider: AI_RESEARCH_PROVIDER_ID,
        status: "connected",
      },
    }),
  ]);
  if (!project) return unavailableTile("no_data", "no_prompts");
  return buildAiAnswersTile({
    connected: connection !== null,
    day1: period.from,
    end: period.to,
    names: {
      aliases: project.brandAliases,
      domain: project.domain,
      excludedNames: project.brandExcludedNames,
      label: project.name,
    },
    prompts: prompts.flatMap((prompt) => {
      const text = prompt.revisions[0]?.text;
      return text ? [{ id: prompt.id, text }] : [];
    }),
    samples: samples.flatMap((sample) =>
      sample.answerText && sample.finishedAt
        ? [
            {
              answerText: sample.answerText,
              at: sample.finishedAt.toISOString(),
              engine: sample.engine,
              promptId: sample.promptRevision.promptId,
            },
          ]
        : [],
    ),
  });
}

export async function loadTop10Tile(projectId: string, period: ChallengePeriod) {
  const tracked = await prisma.keyword.count({ where: { archivedAt: null, projectId } });
  if (tracked === 0) return buildTop10Tile({ end: [], hasChecks: false, start: [], tracked: 0 });
  const start = new Date(`${period.from}T23:59:59.999Z`);
  const end = new Date(`${period.to}T23:59:59.999Z`);
  const rows = await prisma.$queryRaw<
    { edge: string; position: number; text: string }[]
  >`SELECT boundary.edge, rc.position, k.text
    FROM keywords k
    JOIN (
      SELECT 'start'::text AS edge, ${start}::timestamptz AS instant
      UNION ALL
      SELECT 'end'::text, ${end}::timestamptz
    ) boundary ON true
    JOIN LATERAL (
      SELECT position
      FROM rank_checks
      WHERE "keywordId" = k.id
        AND status = 'completed'
        AND position IS NOT NULL
        AND "checkedAt" <= boundary.instant
      ORDER BY "checkedAt" DESC
      LIMIT 1
    ) rc ON true
    WHERE k."projectId" = ${projectId}
      AND k."archivedAt" IS NULL`;
  const mapEdge = (edge: string) =>
    rows
      .filter((row) => row.edge === edge)
      .flatMap((row) => {
        const position = Number(row.position);
        return position >= 1 ? [{ keyword: row.text, position }] : [];
      });
  return buildTop10Tile({
    end: mapEdge("end"),
    hasChecks: rows.length > 0,
    start: mapEdge("start"),
    tracked,
  });
}

export async function loadConversionsTile(
  projectId: string,
  period: ChallengePeriod,
  previous: ChallengePeriod,
  now: Date,
) {
  const sources = await getConversionSources(projectId, now);
  if (!sources.some((source) => source.connected)) {
    return buildConversionsTile({ connected: false, current: 0, goals: [], previous: 0 });
  }
  const [current, earlier] = await Promise.all([
    getConversionTotals(projectId, asDate(period)),
    getConversionTotals(projectId, asDate(previous)),
  ]);
  const goals = current.flatMap((source) => source.goals.map((goal) => goal.displayName));
  return buildConversionsTile({
    connected: true,
    current: current.reduce((total, source) => total + source.totalCount, 0),
    goals,
    previous: earlier.reduce((total, source) => total + source.totalCount, 0),
  });
}
