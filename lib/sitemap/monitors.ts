import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import type { Actor } from "@/lib/auth/authorize";
import { authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { sitemapUrlForDomain } from "./sync";

type MonitorContext = {
  actor: Actor;
  auditActorId?: string | null;
  projectId: string;
};

async function projectForMonitor(context: MonitorContext, action: "read" | "update") {
  const project = await prisma.project.findFirst({
    select: {
      domain: true,
      id: true,
      publicId: true,
      sitemapMonitoringEnabled: true,
      writeMode: true,
    },
    where: { publicId: context.projectId },
  });
  if (!project) throw new Error("Project not found.");
  authorize(context.actor, action, { projectId: project.id, type: "sitemap_monitor" });
  if (action === "update") assertProjectWritable(project);
  return project;
}

async function monitorView(project: Awaited<ReturnType<typeof projectForMonitor>>) {
  const latest = await prisma.sitemapSnapshot.findFirst({
    orderBy: { fetchedAt: "desc" },
    select: { fetchedAt: true, sitemapUrl: true, urlCount: true },
    where: { projectId: project.id },
  });
  return {
    enabled: project.sitemapMonitoringEnabled,
    id: project.publicId,
    latestSnapshot: latest,
    projectId: project.publicId,
    sitemapUrl: trackedProjectDomain(project.domain)
      ? sitemapUrlForDomain(trackedProjectDomain(project.domain) ?? "")
      : null,
    status: !project.sitemapMonitoringEnabled ? "disabled" : latest ? "active" : "pending",
  } as const;
}

export async function listSitemapMonitors(context: MonitorContext) {
  const project = await projectForMonitor(context, "read");
  return [await monitorView(project)];
}

export async function updateSitemapMonitor(
  context: MonitorContext & { enabled: boolean; monitorId: string },
) {
  const project = await projectForMonitor(context, "update");
  if (context.monitorId !== project.publicId) {
    throw new Error("Sitemap monitor not found.");
  }
  const updated = await prisma.project.update({
    data: { sitemapMonitoringEnabled: context.enabled },
    select: {
      domain: true,
      id: true,
      publicId: true,
      sitemapMonitoringEnabled: true,
      writeMode: true,
    },
    where: { id: project.id },
  });
  const actorId = context.auditActorId === undefined ? context.actor.id : context.auditActorId;
  await writeAudit({
    action: context.enabled ? "sitemap_monitor.enable" : "sitemap_monitor.disable",
    actorId,
    after: { enabled: context.enabled },
    before: { enabled: project.sitemapMonitoringEnabled },
    projectId: project.id,
    targetId: project.publicId,
    targetType: "sitemap_monitor",
  });
  return monitorView(updated);
}
