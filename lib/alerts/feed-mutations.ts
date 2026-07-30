import "server-only";

import { alertSnoozedUntil } from "@/lib/alerts/snooze";
import { writeAudit } from "@/lib/auth/audit";
import type { Actor } from "@/lib/auth/authorize";
import { authorize } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";

type MutationContext = {
  actor: Actor;
  auditActorId?: string | null;
  projectId: string;
};

async function writableProject(actor: Actor, projectId: string) {
  const project = await prisma.project.findFirst({
    select: { id: true, publicId: true, writeMode: true },
    where: { OR: [{ id: projectId }, { publicId: projectId }] },
  });
  if (!project) throw new Error("Project not found.");
  authorize(actor, "update", { projectId: project.id, type: "alert_rule" });
  assertProjectWritable(project);
  return project;
}

function auditActorId(context: MutationContext) {
  return context.auditActorId === undefined ? context.actor.id : context.auditActorId;
}

function requiredPublicId(value: string | null, prefix: "al" | "prj", resource: string) {
  if (!value || !isPublicIdOfType(value, prefix)) {
    throw new Error(`${resource} public ID is not available.`);
  }
  return value;
}

export async function markProjectAlertsRead(context: MutationContext) {
  const project = await writableProject(context.actor, context.projectId);
  const result = await prisma.triggeredAlert.updateMany({
    data: { status: "acknowledged" },
    where: { rule: { projectId: project.id }, status: "firing" },
  });

  await writeAudit({
    action: "triggered_alert.mark_all_read",
    actorId: auditActorId(context),
    after: { acknowledged: result.count },
    projectId: project.id,
    targetId: requiredPublicId(project.publicId, "prj", "Project"),
    targetType: "project",
  });

  return { updated: result.count };
}

export async function muteTriggeredAlert(context: MutationContext & { alertId: string }) {
  const project = await writableProject(context.actor, context.projectId);
  if (!isPublicIdOfType(context.alertId, "al")) {
    throw new Error("Triggered alert not found.");
  }
  const before = await prisma.triggeredAlert.findFirst({
    select: { id: true, publicId: true, snoozedUntil: true, status: true },
    where: { publicId: context.alertId, rule: { projectId: project.id } },
  });
  if (!before) throw new Error("Triggered alert not found.");

  const snoozedUntil = alertSnoozedUntil();
  const alert = await prisma.triggeredAlert.update({
    data: { snoozedUntil },
    select: { id: true, publicId: true, snoozedUntil: true, status: true },
    where: { id: before.id },
  });
  await writeAudit({
    action: "triggered_alert.snooze",
    actorId: auditActorId(context),
    after: { snoozedUntil: alert.snoozedUntil, status: alert.status },
    before: { snoozedUntil: before.snoozedUntil, status: before.status },
    projectId: project.id,
    targetId: requiredPublicId(alert.publicId, "al", "Triggered alert"),
    targetType: "triggered_alert",
  });

  return { muted: true, snoozedUntil: alert.snoozedUntil };
}
