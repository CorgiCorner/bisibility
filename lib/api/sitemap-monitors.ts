import "server-only";

import {
  listSitemapMonitors as listSitemapMonitorsCore,
  updateSitemapMonitor as updateSitemapMonitorCore,
} from "@/lib/sitemap/monitors";
import { z } from "zod";
import type { ApiContext } from "./context";
import { requireApiPublicId } from "./public-id";
import { listResponse, resourceResponse } from "./responses";
import {
  objectBody,
  parseApiInput,
  readJsonBody,
  runDomain,
  scopedProject,
  snakeizeKeys,
} from "./surface";

const updateSchema = z.object({ enabled: z.boolean() });

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
      projectId: ctx.auth.project.id,
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
  const input = parseApiInput(updateSchema, objectBody(body));
  const monitor = await runDomain(() =>
    updateSitemapMonitorCore({
      actor: ctx.actor as NonNullable<ApiContext["actor"]>,
      auditActorId: ctx.actorId,
      enabled: input.enabled,
      monitorId,
      projectId: ctx.auth.project.id,
    }),
  );
  return resourceResponse(snakeizeKeys(sitemapMonitorResource(monitor)), { headers: ctx.headers });
}
