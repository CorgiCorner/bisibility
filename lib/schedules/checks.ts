import "server-only";
import type { TrackingScheduleListItem } from "@/lib/ai-tracking/projections/schedule-list";
import { trackingScheduleListItems } from "@/lib/ai-tracking/projections/schedule-list";
import { listPrompts } from "@/lib/ai-tracking/stores/prompts";
import { listSchedules as listAiSchedules } from "@/lib/ai-tracking/stores/schedules";
import { activeTrackingPromptWhere } from "@/lib/ai-tracking/stores/shared";
import { prisma } from "@/lib/db/prisma";
import { listCheckScheduleRows } from "@/lib/queries/check-schedule-list";
import { aiScheduleCost, monthlyScheduleCost } from "./list-pricing";
import { type AiSchedule, type RankSchedule, scheduleState } from "./types";

export async function listRankSchedules(projectId: string, status: "current" | "archived") {
  const [rows, runs] = await Promise.all([
    listCheckScheduleRows(projectId, status),
    prisma.rankCheckRun.findMany({
      where: {
        projectId,
        checkScheduleId: { not: null },
        deletedAt: null,
        startedAt: { not: null },
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      distinct: ["checkScheduleId"],
      select: {
        startedAt: true,
        status: true,
        outcome: true,
        checkSchedule: { select: { publicId: true } },
      },
    }),
  ]);
  return rows.map((rank): RankSchedule => {
    const last = runs.find((run) => run.checkSchedule?.publicId === rank.publicId);
    const active = rank.enabled && rank.frequency !== "paused" && rank.frequency !== "manual";
    const cadence = {
      frequency: rank.frequency,
      cron_expression: rank.cronExpression,
      timezone: rank.timezone,
      time_of_day: rank.timeOfDay,
    };
    return {
      id: rank.publicId,
      name: rank.name,
      kind: "rank",
      group: "checks",
      actions: ["read"],
      state: scheduleState(active, rank.archivedAt),
      state_reason: null,
      cadence,
      target: { type: "keywords" },
      settings: { serp_depth: rank.serpDepth, jitter_minutes: rank.jitterMinutes },
      limits: {},
      next_run_at: active && !rank.archivedAt ? rank.nextRunAt : null,
      last_run_at: last?.startedAt?.toISOString() ?? null,
      last_run_state: last?.outcome ?? last?.status ?? null,
      target_summary: { keywords: rank.keywordCount, targets: rank.targetCount },
      monthly_cost_estimate_cents: monthlyScheduleCost(
        rank.nativeEstimate?.unit === "cents" ? rank.nativeEstimate.quantity : rank.perRunCents,
        cadence,
      ),
      rank,
    };
  });
}

export async function listAiScheduleRows(projectId: string, status: "current" | "archived") {
  const [schedules, prompts] = await Promise.all([
    listAiSchedules(projectId),
    listPrompts(projectId),
  ]);
  return trackingScheduleListItems(schedules, prompts, status);
}

export async function projectAiSchedules(
  projectId: string,
  rows: readonly TrackingScheduleListItem[],
  now: Date,
) {
  if (rows.length === 0) return [];
  const [runs, activePrompts] = await Promise.all([
    prisma.aiTrackingRun.findMany({
      where: { projectId, scheduleId: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      distinct: ["scheduleId"],
      select: { createdAt: true, state: true, schedule: { select: { publicId: true } } },
    }),
    prisma.aiPrompt.findMany({
      where: activeTrackingPromptWhere(projectId),
      select: { publicId: true },
    }),
  ]);
  const activeIds = new Set(activePrompts.map((prompt) => prompt.publicId));
  return rows.map((ai): AiSchedule => {
    const last = runs.find((run) => run.schedule?.publicId === ai.id);
    return {
      id: ai.id,
      name: ai.name,
      kind: "ai",
      group: "checks",
      actions: ["read"],
      state: scheduleState(ai.enabled, ai.archivedAt),
      state_reason: null,
      cadence: { frequency: "custom_cron", cron_expression: ai.cron, timezone: ai.timezone },
      target: { type: "prompts", ids: ai.promptIds },
      settings: {},
      limits: {},
      next_run_at: ai.enabled && !ai.archivedAt ? ai.nextRunAt : null,
      last_run_at: last?.createdAt.toISOString() ?? null,
      last_run_state: last?.state ?? null,
      target_summary: { prompts: ai.promptIds.length },
      monthly_cost_estimate_cents: aiScheduleCost(
        ai,
        ai.promptIds.filter((id) => activeIds.has(id)).length,
        now,
      ),
      ai,
    };
  });
}
