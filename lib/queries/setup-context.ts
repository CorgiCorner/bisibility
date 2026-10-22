import "server-only";

import { effectiveCompetitors } from "@/lib/competitors/effective";
import { getCompetitorSuggestions } from "@/lib/competitors/suggestions";
import { prisma } from "@/lib/db/prisma";
import { type PublicIdForPrefix, requirePublicId } from "@/lib/db/public-id";
import type { SetupContext } from "@/lib/getting-started/setup-steps";
import { keywordMembershipSelect } from "@/lib/keywords/membership-select";
import {
  createKeywordMembershipProjector,
  type KeywordScheduleMembership,
} from "@/lib/keywords/schedule-membership";
import { requireReadableProject } from "@/lib/queries/_auth";
import {
  ACTIVE_QUEUED_BATCH_STATES,
  ACTIVE_QUEUED_TASK_STATES,
  QUEUED_TASK_TRANSITIONS,
} from "@/lib/rank-check/queued-state";
import { cache } from "react";

type SetupKeyword = {
  checkSchedule: KeywordScheduleMembership | null;
  id: string;
  publicId: string;
};

function resolveSchedule(keywords: readonly SetupKeyword[], now: Date): SetupContext["schedule"] {
  const membership = createKeywordMembershipProjector(now);
  const scheduled = keywords.flatMap((keyword) => {
    const current = membership(keyword.checkSchedule, keyword.id);
    return current.nextCheckAt
      ? [{ nextRunAt: current.nextCheckAt, timezone: current.timezone }]
      : [];
  });
  const next = scheduled.sort((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime())[0];
  return next ? { mode: "scheduled", ...next } : { mode: "manual" };
}

type QueuedTaskState = keyof typeof QUEUED_TASK_TRANSITIONS;
type QueuedTask = { rankCheckId: PublicIdForPrefix<"check">; state: QueuedTaskState };

function queuedTask(row: { rankCheck: { publicId: string }; state: string }): QueuedTask {
  if (!(row.state in QUEUED_TASK_TRANSITIONS)) {
    throw new Error(`Unknown queued rank-check task state: ${row.state}`);
  }
  return {
    rankCheckId: requirePublicId(row.rankCheck.publicId, "check"),
    state: row.state as QueuedTaskState,
  };
}

function batchProgress(
  batches: Array<{ tasks: Array<{ rankCheck: { publicId: string }; state: string }> }>,
) {
  if (batches.length === 0) return null;
  const tasks = batches.flatMap((batch) => batch.tasks).map(queuedTask);
  return {
    completed: tasks.filter((task) => task.state === "completed").length,
    rankCheckIds: tasks
      .filter((task) => ACTIVE_QUEUED_TASK_STATES.includes(task.state))
      .map((task) => task.rankCheckId),
    total: tasks.length,
  };
}

async function loadSetupContextUncached(
  projectRef: string,
  now = new Date(),
): Promise<SetupContext> {
  const { project } = await requireReadableProject(projectRef);
  const setupReads = await Promise.all([
    prisma.keyword.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        publicId: true,
        checkSchedule: { select: keywordMembershipSelect },
      },
      where: { projectId: project.id, archivedAt: null },
    }),
    prisma.providerConnection.count({
      where: { enabled: true, kind: "serp", projectId: project.id, status: "connected" },
    }),
    prisma.rankCheck.count({
      where: { keyword: { projectId: project.id }, status: "completed" },
    }),
    prisma.queuedRankCheckBatch.findMany({
      orderBy: [{ claimedAt: "asc" }, { id: "asc" }],
      select: {
        tasks: { select: { rankCheck: { select: { publicId: true } }, state: true } },
      },
      where: { projectId: project.id, state: { in: ACTIVE_QUEUED_BATCH_STATES } },
    }),
    prisma.project.findUnique({
      select: { competitorSetupOutcome: true },
      where: { id: project.id },
    }),
    effectiveCompetitors(project.id, null),
  ]);
  const [keywords, providerCount, completedCheckCount, activeBatch, competitorSetup, competitors] =
    setupReads;
  const competitorSetupOutcome =
    competitors.length > 0 ? "confirmed" : (competitorSetup?.competitorSetupOutcome ?? null);
  const competitorSuggestions =
    completedCheckCount > 0 && competitorSetupOutcome === null
      ? await getCompetitorSuggestions(project.id)
      : [];

  return {
    completedCheckCount,
    competitorSetupOutcome,
    competitorSuggestions,
    inFlightBatch: batchProgress(activeBatch),
    keywordCount: keywords.length,
    keywordIds: keywords.map((keyword) => requirePublicId(keyword.publicId, "kw")),
    project: {
      exists: true,
      name: project.name,
      publicRef: requirePublicId(project.publicId, "prj"),
    },
    providerExists: providerCount > 0,
    schedule: resolveSchedule(keywords, now),
  };
}

export const loadSetupContext = cache(loadSetupContextUncached);
