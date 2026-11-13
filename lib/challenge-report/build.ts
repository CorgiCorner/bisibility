import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getActivePageSnapshot } from "@/lib/pages/snapshot-read";
import { assembleChallengeReport, settleChallengeTiles } from "./assemble";
import { loadCostTile } from "./load-cost";
import {
  loadActiveDaysTile,
  loadAiAnswersTile,
  loadConversionsTile,
  loadTop10Tile,
} from "./load-outcomes";
import { loadClicksTile, loadExistingVsNewTile, loadTopPagesTile } from "./load-search";
import { periodFromStart, previousPeriod, stageForDays, utcDateKey } from "./period";
import { readProjectWorkDates } from "./project-challenge";
import {
  type ChallengeLessons,
  type ChallengeReportBody,
  challengeReportBodySchema,
  emptyChallengeLessons,
} from "./schema";
import { unavailableTile } from "./tile-state";
import { buildActiveDaysTile } from "./tiles-outcomes";

export async function readChallengeReportDefaults(projectId: string) {
  const [project, snapshot] = await Promise.all([
    prisma.project.findUnique({
      select: { createdAt: true, domain: true, name: true },
      where: { id: projectId },
    }),
    getActivePageSnapshot(projectId),
  ]);
  if (!project) throw new Error("Project not found.");
  const domain = project.domain?.trim() || project.name;
  return {
    defaultStart: snapshot?.takenOn ?? utcDateKey(project.createdAt),
    domain,
  };
}

export async function buildChallengeReport(input: {
  actorId: string;
  days: number;
  from: string;
  generatedAt?: Date;
  lessons?: ChallengeLessons;
  projectId: string;
  work?: "project" | "hidden";
  journey?: ChallengeReportBody["journey"];
  snapshotId?: string;
}): Promise<ChallengeReportBody> {
  const period = periodFromStart(input.from, input.days);
  const previous = previousPeriod(period);
  const generatedAt = input.generatedAt ?? new Date();
  const settled = await settleChallengeTiles({
    activeDays: () => loadReportWork(input, period),
    aiAnswers: () => loadAiAnswersTile(input.projectId, period),
    clicks: () => loadClicksTile(input.projectId, period, previous),
    conversions: () => loadConversionsTile(input.projectId, period, previous, generatedAt),
    cost: () => loadCostTile(input.projectId, period),
    existingVsNew: () => loadExistingVsNewTile(input.projectId, period, input.snapshotId),
    top10: () => loadTop10Tile(input.projectId, period),
    topPages: () => loadTopPagesTile(input.projectId, period),
  });
  return challengeReportBodySchema.parse({
    ...assembleChallengeReport({
      generatedAt: generatedAt.toISOString(),
      lessons: input.lessons ?? emptyChallengeLessons,
      period,
      settled,
      stage: stageForDays(period.days),
    }),
    ...(input.journey ? { journey: input.journey } : {}),
    ...(input.work ? { workScope: input.work } : {}),
  });
}

export async function previewChallengeTiles(input: {
  actorId: string;
  days: number;
  from: string;
  projectId: string;
}) {
  const body = await buildChallengeReport(input);
  return {
    tiles: (Object.keys(body.tiles) as (keyof typeof body.tiles)[]).map((id) => ({
      id,
      state: body.tiles[id].state,
    })),
  };
}

async function loadReportWork(
  input: { actorId: string; projectId: string; work?: "project" | "hidden" },
  period: ReturnType<typeof periodFromStart>,
) {
  if (!input.work) return loadActiveDaysTile(input.actorId, period);
  if (input.work === "hidden") return unavailableTile("no_data", "activity_hidden");
  const dates = await readProjectWorkDates(input.actorId, input.projectId, period);
  if (dates === null) return unavailableTile("no_data", "activity_off");
  return buildActiveDaysTile({
    activeDates: dates,
    from: period.from,
    scope: "project",
    to: period.to,
  });
}
