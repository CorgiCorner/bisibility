import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ScheduleMutationError, scheduleNotFound } from "./errors";
import { listLocalMonitorSchedules } from "./local-monitors";
import { scheduleMessage } from "./messages";
import type { LocalScheduleCommand } from "./mutate-local";
import { syncPauseKinds, syncPauseSelection } from "./sync-pauses";
import {
  type DataSyncKind,
  type LocalMonitorSchedule,
  type ScheduleState,
  scheduleState,
} from "./types";

export type ScheduleStateCommand =
  | {
      kind: "rank";
      archive?: { destinationScheduleId: string | null; projectId: string; scheduleId: string };
      destinationScheduleId?: string | null;
      projectPublicId?: string;
      restore?: true;
    }
  | { kind: "ai"; restore?: true; value?: unknown }
  | {
      kind: "data_sync";
      projectPublicId?: string;
      syncKind: DataSyncKind;
      publicWrite?: true;
      auditActorId?: string | null;
    }
  | {
      kind: "local_monitor";
      local?: LocalScheduleCommand;
      projectPublicId?: string;
      restore?: true;
    };

export type StoredSchedule =
  | { kind: "rank"; state: ScheduleState }
  | { kind: "ai"; internalId: string; state: ScheduleState }
  | { kind: "data_sync"; projectPublicId: string; state: ScheduleState; syncKind: DataSyncKind }
  | { kind: "local_monitor"; row: LocalMonitorSchedule; state: ScheduleState };

/** The caller has already authorized the project. This read does not grant access. */
export async function readScheduleState(
  projectId: string,
  id: string,
  command: ScheduleStateCommand,
  db: Prisma.TransactionClient = prisma,
): Promise<StoredSchedule> {
  if (command.kind === "rank")
    return { kind: "rank", state: await readRankState(projectId, id, db) };
  if (command.kind === "ai") return readAiState(projectId, id, db);
  if (command.kind === "local_monitor") return readLocalState(projectId, id, db);
  return readDataSyncState(projectId, id, command.projectPublicId, command.syncKind, db);
}

async function readRankState(
  projectId: string,
  id: string,
  db: Prisma.TransactionClient,
): Promise<ScheduleState> {
  const row = await db.checkSchedule.findFirst({
    select: { archivedAt: true, enabled: true },
    where: { projectId, publicId: id },
  });
  if (!row) throw scheduleNotFound();
  return scheduleState(row.enabled, row.archivedAt);
}

async function readAiState(
  projectId: string,
  id: string,
  db: Prisma.TransactionClient,
): Promise<StoredSchedule> {
  const row = await db.aiTrackingSchedule.findFirst({
    select: { archivedAt: true, enabled: true, id: true },
    where: { projectId, publicId: id },
  });
  if (!row) throw scheduleNotFound();
  return { internalId: row.id, kind: "ai", state: scheduleState(row.enabled, row.archivedAt) };
}

async function readLocalState(
  projectId: string,
  id: string,
  db: Prisma.TransactionClient,
): Promise<StoredSchedule> {
  const [row] = await listLocalMonitorSchedules(projectId, "current", new Date(), id, db);
  if (!row || row.id !== id) throw scheduleNotFound();
  return { kind: "local_monitor", row, state: row.state };
}

async function readDataSyncState(
  projectId: string,
  id: string,
  projectPublicId: string | undefined,
  syncKind: DataSyncKind,
  db: Prisma.TransactionClient,
): Promise<StoredSchedule> {
  if (!projectPublicId) {
    throw new ScheduleMutationError(
      "schedule_project_required",
      scheduleMessage("projectRequired"),
    );
  }
  if (id !== `sync:${projectPublicId}:${syncKind}`) throw scheduleNotFound();
  const project = await db.project.findFirst({
    select: { publicId: true, syncPauses: syncPauseSelection(syncPauseKinds[syncKind]) },
    where: { id: projectId, publicId: projectPublicId },
  });
  if (!project || project.publicId !== projectPublicId) throw scheduleNotFound();
  return {
    kind: "data_sync",
    projectPublicId,
    state: scheduleState(project.syncPauses.length === 0),
    syncKind,
  };
}
