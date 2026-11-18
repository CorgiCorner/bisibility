import "server-only";
import { writeAudit } from "@/lib/auth/audit";
import type { Actor } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  countUserPausedSearchImports,
  resumeUserPausedSearchImports,
} from "@/lib/search-insights/sync/user-pause-control";
import { updateSitemapMonitor } from "@/lib/sitemap/monitors";
import { authorizeDataSyncState } from "./data-sync-permission";
import { ScheduleMutationError, ScheduleTransitionError, scheduleNotFound } from "./errors";
import { scheduleMessage } from "./messages";
import { syncPauseKinds, writeProjectSyncPause } from "./sync-pauses";
import type { DataSyncKind, ScheduleState } from "./types";

export async function setDataSyncState(
  projectId: string,
  actor: Actor,
  syncKind: DataSyncKind,
  state: ScheduleState,
  projectPublicId: string | undefined,
  tx?: Prisma.TransactionClient,
  options?: { publicWrite?: true; auditActorId?: string | null },
) {
  if (!projectPublicId) {
    throw new ScheduleMutationError(
      "schedule_project_required",
      scheduleMessage("projectRequired"),
    );
  }
  const project = await (tx ?? prisma).project.findFirst({
    select: { id: true },
    where: { id: projectId, publicId: projectPublicId },
  });
  if (!project) throw scheduleNotFound();
  // Every surface (web, public API, MCP) reaches this write; it enforces the sync's own control.
  authorizeDataSyncState(actor, projectId, syncKind);
  if (state === "archived") throw new ScheduleTransitionError(scheduleMessage("dataSyncArchive"));
  const enabled = state === "active";
  const auditActorId = options?.auditActorId;
  if (syncKind === "sitemap") {
    const input = {
      actor,
      ...(auditActorId === undefined ? {} : { auditActorId }),
      enabled,
      monitorId: projectPublicId,
      projectId: projectPublicId,
    };
    return tx ? updateSitemapMonitor(input, tx) : updateSitemapMonitor(input);
  }
  const actorId = auditActorId === undefined ? actor.id : auditActorId;
  const kind = syncPauseKinds[syncKind];
  // The pause record, its legacy mirror and the audit row commit with the caller's
  // transaction, so a reviewed write lands together with its review receipt.
  const write = async (client: Prisma.TransactionClient) => {
    const pauseRowAbsent = await writeProjectSyncPause(client, {
      actorId,
      enabled,
      kind,
      projectId,
    });
    const isRating = syncKind === "domain_rating";
    // The property-level import pause also stops Search Console, so Schedules reports it as
    // paused; a resume from Schedules clears it in the same transaction and audit row.
    const importPauses =
      syncKind === "search_console" ? await countUserPausedSearchImports(client, projectId) : 0;
    if (enabled && importPauses > 0) await resumeUserPausedSearchImports(client, projectId);
    const previous = pauseRowAbsent && importPauses === 0;
    const imports = (count: number) =>
      syncKind === "search_console" ? { importPauses: count } : {};
    await writeAudit(
      {
        action: isRating ? "project.domain_rating.update" : "project.data_sync.update",
        actorId,
        after: isRating ? { enabled } : { enabled, kind, ...imports(enabled ? 0 : importPauses) },
        before: isRating
          ? { enabled: previous }
          : { enabled: previous, kind, ...imports(importPauses) },
        projectId,
        targetId: projectPublicId,
        targetType: "project",
      },
      client,
    );
  };
  if (tx) await write(tx);
  else await prisma.$transaction(write);
  return { enabled };
}
