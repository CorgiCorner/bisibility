import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { type Actor, authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { syncPauseSelection, writeProjectSyncPause } from "@/lib/schedules/sync-pauses";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { sitemapUrlForDomain } from "./sync";

type MonitorContext = {
  actor: Actor;
  auditActorId?: string | null;
  projectId: string;
};

async function projectForMonitor(
  context: MonitorContext,
  action: "read" | "update",
  db: Prisma.TransactionClient,
) {
  const project = await db.project.findFirst({
    select: {
      domain: true,
      id: true,
      publicId: true,
      syncPauses: syncPauseSelection("sitemap_fetch"),
    },
    where: { publicId: context.projectId },
  });
  if (!project) throw new Error("Project not found.");
  authorize(context.actor, action, { projectId: project.id, type: "sitemap_monitor" });
  return project;
}

async function monitorView(
  project: Awaited<ReturnType<typeof projectForMonitor>>,
  enabled: boolean,
  db: Prisma.TransactionClient,
) {
  const latest = await db.sitemapSnapshot.findFirst({
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true, sitemapUrl: true, urlCount: true },
    where: { projectId: project.id },
  });
  const domain = trackedProjectDomain(project.domain);
  return {
    enabled,
    id: project.publicId,
    latestSnapshot: latest,
    projectId: project.publicId,
    sitemapUrl: domain ? sitemapUrlForDomain(domain) : null,
    status: !enabled ? "disabled" : latest ? "active" : "pending",
  } as const;
}

export async function listSitemapMonitors(context: MonitorContext) {
  const project = await projectForMonitor(context, "read", prisma);
  return [await monitorView(project, project.syncPauses.length === 0, prisma)];
}

export async function updateSitemapMonitor(
  context: MonitorContext & { enabled: boolean; monitorId: string },
  tx?: Prisma.TransactionClient,
) {
  const project = await projectForMonitor(context, "update", tx ?? prisma);
  if (context.monitorId !== project.publicId) throw new Error("Sitemap monitor not found.");
  const actorId = context.auditActorId === undefined ? context.actor.id : context.auditActorId;
  const write = async (db: Prisma.TransactionClient) => {
    const previous = await writeProjectSyncPause(db, {
      actorId,
      enabled: context.enabled,
      kind: "sitemap_fetch",
      projectId: project.id,
    });
    await writeAudit(
      {
        action: context.enabled ? "sitemap_monitor.enable" : "sitemap_monitor.disable",
        actorId,
        after: { enabled: context.enabled },
        before: { enabled: previous },
        projectId: project.id,
        targetId: project.publicId,
        targetType: "sitemap_monitor",
      },
      db,
    );
    return monitorView(project, context.enabled, db);
  };
  return tx ? write(tx) : prisma.$transaction(write);
}
