import "server-only";
import type { Actor } from "@/lib/auth/authorize";
import type { Prisma } from "@/lib/generated/prisma/client";
import { pauseRecurringFor, restoreRecurringFor } from "@/lib/local-monitor-recurring/service";
import { setLocalMonitorScheduleIntent } from "@/lib/local-monitor-store/schedule";
import { ScheduleMutationError, ScheduleTransitionError } from "./errors";
import { listLocalMonitorSchedules } from "./local-monitors";
import { scheduleMessage } from "./messages";
import type { LocalMonitorSchedule, ScheduleState } from "./types";

export type LocalScheduleCommand = {
  expectedVersion: number;
  idempotencyKey: string;
  monitorId: string;
  projectId: string;
};

export function pauseLocalMonitorSchedule(input: unknown, context: { actor: Actor }) {
  return pauseRecurringFor(input, context);
}

export async function setLocalMonitorScheduleState(
  projectId: string,
  actor: Actor,
  id: string,
  state: ScheduleState,
  command?: LocalScheduleCommand,
  projectPublicId?: string,
  restore = false,
  tx?: Prisma.TransactionClient,
) {
  const current = await findMonitor(projectId, id, tx);
  if (state === "active") {
    if (tx && current.state !== "active") throw new ScheduleTransitionError();
    return activate(current);
  }
  assertCommand(command, id, projectPublicId);
  if (state === "paused") {
    const mutate = restore ? restoreRecurringFor : pauseRecurringFor;
    if (!tx) return mutate(command, { actor });
    const result = await mutate(command, { actor }, tx);
    if (result.kind !== "saved") {
      throw new ScheduleMutationError(
        `schedule_local_${result.kind}`,
        scheduleMessage("transition"),
      );
    }
    return result;
  }
  return setLocalMonitorScheduleIntent(
    {
      ...command,
      consentToken: null,
      expectedScheduleEpoch: null,
      mode: "archived",
      scheduleId: null,
    },
    { actor },
    {
      verify: async () => {
        throw new Error("An archived schedule has no paid authority.");
      },
    },
    ...(tx ? ([{ tx }] as const) : []),
  );
}

function activate(current: LocalMonitorSchedule) {
  if (current.state === "archived") throw new ScheduleTransitionError();
  if (current.state === "active") return current;
  return { ...current, state_reason: "approval_expired" as const };
}

function assertCommand(
  command: LocalScheduleCommand | undefined,
  id: string,
  projectPublicId: string | undefined,
): asserts command is LocalScheduleCommand {
  if (!command || command.monitorId !== id) {
    throw new ScheduleMutationError(
      "schedule_command_required",
      scheduleMessage("commandRequired"),
    );
  }
  if (!projectPublicId || command.projectId !== projectPublicId) {
    throw new ScheduleMutationError(
      "schedule_project_required",
      scheduleMessage("projectRequired"),
    );
  }
}

async function findMonitor(projectId: string, id: string, tx?: Prisma.TransactionClient) {
  const [row] = await listLocalMonitorSchedules(projectId, "current", new Date(), id, tx);
  if (!row || row.id !== id)
    throw new ScheduleMutationError("schedule_not_found", scheduleMessage("notFound"));
  return row;
}
