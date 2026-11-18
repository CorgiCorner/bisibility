import "server-only";

import { scheduleNotFound } from "@/lib/schedules/errors";
import { setScheduleState } from "@/lib/schedules/mutations";
import { scheduleReviewSchema } from "@/lib/schemas/schedule-review";
import { listSitemapMonitors as listSitemapMonitorsCore } from "@/lib/sitemap/monitors";
import { z } from "zod";
import type { ApiContext } from "./context";
import { requireApiActor } from "./context";
import { ApiNotFoundError } from "./errors";
import { requireApiPublicId } from "./public-id";
import { listResponse, resourceResponse } from "./responses";
import { apiScheduleReviewer, withApiScheduleAudit } from "./schedule-reviewer";
import { objectBody, readJsonBody, runDomain, scopedProject, snakeizeKeys } from "./surface";

export const updateSchema = z.object({
  enabled: z.boolean(),
  review: scheduleReviewSchema.optional(),
});

function sitemapMonitorResource(
  monitor: Awaited<ReturnType<typeof listSitemapMonitorsCore>>[number],
) {
  return {
    ...monitor,
    id: requireApiPublicId(monitor.id ?? "", "prj"),
    projectId: requireApiPublicId(monitor.projectId ?? "", "prj"),
  };
}

export async function listSitemapMonitors(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const monitors = await runDomain(() =>
    listSitemapMonitorsCore({
      actor: ctx.actor as NonNullable<ApiContext["actor"]>,
      projectId: ctx.auth.project.publicId,
    }),
  );
  return listResponse(
    monitors.map((monitor) => snakeizeKeys(sitemapMonitorResource(monitor))),
    null,
    {
      headers: ctx.headers,
    },
  );
}

export async function updateSitemapMonitor(ctx: ApiContext, projectId: string, monitorId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;
  const body = await readJsonBody(ctx);
  const input = updateSchema.parse(objectBody(body));
  const project = ctx.auth.project;
  if (monitorId !== project.publicId) throw new ApiNotFoundError("Sitemap monitor not found.");
  const monitor = await withApiScheduleAudit(ctx, () =>
    setScheduleState(
      project.id,
      requireApiActor(ctx),
      `sync:${project.publicId}:sitemap`,
      input.enabled ? "active" : "paused",
      {
        kind: "data_sync",
        syncKind: "sitemap",
        projectPublicId: project.publicId,
        publicWrite: true,
        auditActorId: ctx.actorId ?? null,
      },
      {
        atomic: true,
        gate: true,
        review: input.review,
        reviewPrincipal: apiScheduleReviewer(ctx),
      },
    ),
  );
  if (!("sitemapUrl" in monitor)) throw scheduleNotFound();
  return resourceResponse(snakeizeKeys(sitemapMonitorResource(monitor)), { headers: ctx.headers });
}
