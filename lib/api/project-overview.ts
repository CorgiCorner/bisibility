import "server-only";

import {
  resolveEffectiveSchedule,
  summarizeEffectiveSchedules,
} from "@/lib/keywords/effective-schedule";
import { buildOverviewMetrics, snapshotFor } from "@/lib/queries/overview-builders";
import { loadOverviewMetricData } from "@/lib/queries/overview-data";
import { historyExportReportOptions } from "@/lib/rank-history/export-host";
import { z } from "zod";
import type { ApiContext } from "./context";
import { requireApiPublicId } from "./public-id";
import { historyApiAuthority } from "./rank-history-export";
import { resourceResponse } from "./responses";
import { scopedProject } from "./surface";

export const projectOverviewQuerySchema = z.object({
  device: z.enum(["all", "desktop", "mobile"]).default("all"),
  range: z.enum(["7d", "28d", "90d"]).default("28d"),
  tag: z
    .string()
    .trim()
    .max(48)
    .transform((value) => value || null)
    .default(""),
});

function queryInput(ctx: ApiContext) {
  return projectOverviewQuerySchema.parse({
    device: ctx.url.searchParams.get("device") ?? undefined,
    range: ctx.url.searchParams.get("range") ?? undefined,
    tag: ctx.url.searchParams.get("tag") ?? undefined,
  });
}

export async function getProjectOverview(ctx: ApiContext, projectId: string) {
  const denied = scopedProject(ctx, projectId);
  if (denied) return denied;

  const publicProjectId = requireApiPublicId(ctx.auth.project.publicId ?? "", "prj");
  const filters = queryInput(ctx);
  const asOf = new Date();
  const report = historyExportReportOptions(
    historyApiAuthority(ctx),
    asOf,
    { "7d": 7, "28d": 28, "90d": 90 }[filters.range],
  );
  const data = await loadOverviewMetricData(ctx.auth.project.id, filters, asOf, { report });
  const snapshots = data.keywords.map((keyword) =>
    snapshotFor(keyword, data.keywordVolumes.get(keyword.id) ?? null, asOf),
  );
  const metrics = buildOverviewMetrics(snapshots, { asOf });
  const schedules = data.keywords.length
    ? data.keywords.map((keyword) =>
        resolveEffectiveSchedule(keyword.schedule, data.projectDefaults, keyword.id),
      )
    : [resolveEffectiveSchedule(null, data.projectDefaults)];
  const nextCheckAt = summarizeEffectiveSchedules(schedules).nextCheckAt;

  return resourceResponse(
    {
      average_position: metrics.averagePosition,
      average_position_delta: metrics.averagePositionDelta,
      keywords_added_this_month: data.addedThisMonth,
      last_check_at: data.latestCheck?.checkedAt.toISOString() ?? null,
      next_check_at: nextCheckAt?.toISOString() ?? null,
      position_distribution: metrics.positionDistribution,
      project_id: publicProjectId,
      top_3_count: metrics.top3Count,
      top_10_count: metrics.top10Count,
      top_10_delta: metrics.top10Delta,
      top_100_count: metrics.top100Count,
      tracked_keyword_count: data.filteredKeywordCount,
      visibility: metrics.visibility,
      visibility_delta: metrics.visibilityDelta,
    },
    { headers: ctx.headers },
  );
}
