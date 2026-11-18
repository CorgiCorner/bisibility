import "server-only";
import type { Actor } from "@/lib/auth/authorize";
import { isPublicIdOfType } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  archiveSchedule as archiveRankSchedule,
  restoreSchedule as restoreRankSchedule,
} from "@/lib/rank-check/schedules/archive";
import { updateSchedule as updateRankSchedule } from "@/lib/rank-check/schedules/service";
import type { UpdateCheckScheduleInput } from "@/lib/schemas/check-schedule";
import { readScheduleState, type ScheduleStateCommand } from "./current-state";
import { ScheduleMutationError, ScheduleReviewGateError, ScheduleTransitionError } from "./errors";
import { scheduleMessage } from "./messages";
import { setAiScheduleState } from "./mutate-ai";
import { setLocalMonitorScheduleState } from "./mutate-local";
import { setDataSyncState } from "./mutate-sync";
import type { ScheduleState } from "./types";

export async function setScheduleStateNow(
  projectId: string,
  actor: Actor,
  id: string,
  state: ScheduleState,
  command: ScheduleStateCommand,
  tx?: Prisma.TransactionClient,
) {
  const current = await readScheduleState(projectId, id, command, tx);
  const restore = "restore" in command && command.restore === true;
  if (restore && state !== "paused") throw new ScheduleTransitionError();
  assertScheduleTransition(current.state, state, restore);
  if (current.state === "archived" && state === "archived") return unchangedSchedule(current, id);
  if (restore && current.state !== "archived") return unchangedSchedule(current, id);
  if (command.kind === "local_monitor") {
    return setLocalMonitorScheduleState(
      projectId,
      actor,
      id,
      state,
      command.local,
      command.projectPublicId,
      restore,
      ...(tx ? ([tx] as const) : []),
    );
  }
  if (command.kind === "data_sync") {
    if (state === "archived") throw new ScheduleTransitionError(scheduleMessage("dataSyncArchive"));
    return setDataSyncState(
      projectId,
      actor,
      command.syncKind,
      state,
      command.projectPublicId,
      tx,
      command,
    );
  }
  if (restore) {
    if (current.kind === "ai") {
      return setAiScheduleState(
        projectId,
        actor,
        id,
        "paused",
        current.state,
        current.internalId,
        undefined,
        tx,
      );
    }
    if (tx) throw new ScheduleReviewGateError();
    return restoreRankSchedule(actor.id, projectId, id);
  }
  if (current.kind === "ai") {
    return setAiScheduleState(
      projectId,
      actor,
      id,
      state,
      current.state,
      current.internalId,
      command.kind === "ai" ? command.value : undefined,
      tx,
    );
  }
  if (state === "archived" && command.kind === "rank") {
    const input = command.archive ?? {
      destinationScheduleId: command.destinationScheduleId ?? null,
      scheduleId: id,
    };
    return tx
      ? archiveRankSchedule(actor.id, projectId, input, tx)
      : archiveRankSchedule(actor.id, projectId, input);
  }
  const patch = rankEnabledPatch(
    id,
    state === "active",
    command.kind === "rank" ? command.projectPublicId : undefined,
  );
  return tx
    ? updateRankSchedule(actor.id, projectId, patch, tx)
    : updateRankSchedule(actor.id, projectId, patch);
}

function unchangedSchedule(current: Awaited<ReturnType<typeof readScheduleState>>, id: string) {
  if (current.kind === "local_monitor") return current.row;
  if (current.kind === "ai") return { id, publicId: id, unchanged: true as const };
  return { changed: false, publicId: id };
}

function rankEnabledPatch(
  id: string,
  enabled: boolean,
  projectPublicId: string | undefined,
): UpdateCheckScheduleInput {
  if (
    !projectPublicId ||
    !isPublicIdOfType(projectPublicId, "prj") ||
    !isPublicIdOfType(id, "sch")
  ) {
    throw new ScheduleMutationError(
      "schedule_project_required",
      scheduleMessage("projectRequired"),
    );
  }
  return { enabled, projectId: projectPublicId, scheduleId: id };
}

export function assertScheduleTransition(from: ScheduleState, to: ScheduleState, restore = false) {
  if (from === "archived" && to === "active") throw new ScheduleTransitionError();
  if (from === "archived" && to === "paused" && !restore) throw new ScheduleTransitionError();
}
