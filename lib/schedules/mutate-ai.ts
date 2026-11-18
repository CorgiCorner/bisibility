import "server-only";
import { restoreSchedule as restoreAiSchedule } from "@/lib/ai-tracking/stores/schedules";
import { mutateTrackingCatalog } from "@/lib/api/ai-tracking-service";
import { writeAudit } from "@/lib/auth/audit";
import type { Actor } from "@/lib/auth/authorize";
import type { Prisma } from "@/lib/generated/prisma/client";
import { scheduleNotFound } from "./errors";
import type { ScheduleState } from "./types";

type AiScheduleRow = Awaited<ReturnType<typeof restoreAiSchedule>>;

/**
 * Pause, archive, create and field updates keep their audits in `auditTrackingCatalog`,
 * which the web action writes after this service returns. Restore has no caller audit,
 * so this function writes `ai_tracking.schedule.restore` once.
 */
export async function setAiScheduleState(
  projectId: string,
  actor: Actor,
  id: string,
  state: ScheduleState,
  current: ScheduleState,
  internalId: string,
  value: unknown,
  tx?: Parameters<typeof mutateTrackingCatalog>[5],
) {
  if (state === "archived") {
    return tx
      ? mutateTrackingCatalog(projectId, "schedules", "DELETE", value ?? {}, id, tx)
      : mutateTrackingCatalog(projectId, "schedules", "DELETE", value ?? {}, id);
  }
  if (current === "archived" && state === "paused")
    return restoreAi(projectId, actor, internalId, tx);
  const patch = { enabled: state === "active" };
  return tx
    ? mutateTrackingCatalog(projectId, "schedules", "PATCH", patch, id, tx)
    : mutateTrackingCatalog(projectId, "schedules", "PATCH", patch, id);
}

async function restoreAi(
  projectId: string,
  actor: Actor,
  internalId: string,
  tx?: Parameters<typeof restoreAiSchedule>[3],
) {
  const recordRestore = async (inner: Prisma.TransactionClient, row: { publicId: string }) => {
    const project = await inner.project.findFirst({
      select: { publicId: true },
      where: { id: projectId },
    });
    if (!project) throw scheduleNotFound();
    await writeAudit(
      {
        action: "ai_tracking.schedule.restore",
        actorId: actor.id,
        after: { resourceId: row.publicId },
        projectId,
        targetId: project.publicId,
        targetType: "project",
      },
      inner,
    );
  };
  const restored = tx
    ? await restoreAiSchedule(projectId, internalId, recordRestore, tx)
    : await restoreAiSchedule(projectId, internalId, recordRestore);
  return publicAiSchedule(restored);
}

function publicAiSchedule(row: AiScheduleRow) {
  return {
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    cron: row.cron,
    enabled: row.enabled,
    id: row.publicId,
    name: row.name,
    nextRunAt: row.nextRunAt,
    timezone: row.timezone,
    updatedAt: row.updatedAt,
  };
}
