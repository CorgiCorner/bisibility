import "server-only";

import type { Client } from "@temporalio/client";
import { RANK_CHECK_DISPATCHER_SCHEDULE_ID } from "../rank-check/dispatcher-constants";
import { type RankCheckSchedulerMode, rankCheckSchedulerMode } from "../rank-check/scheduler-mode";
import {
  type BootstrapScheduleClient,
  ensureReconcilerSchedule,
  RECONCILER_SCHEDULE_ID,
} from "./bootstrap";
import { getTemporalClient } from "./client";
import { ensureRankCheckDispatcherSchedule } from "./rank-check-dispatcher-bootstrap";

export type RankCheckSingletonRetirementStatus = "absent" | "already_paused" | "paused";

export type RankCheckSingletonConvergenceResult = {
  dispatcher: string;
  mode: RankCheckSchedulerMode;
  reconciler: string;
};

export type RankCheckSchedulerConvergenceClient = BootstrapScheduleClient &
  Pick<Client["schedule"], "getHandle">;

function isScheduleNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "ScheduleNotFoundError"
  );
}

async function retireSingleton(
  client: RankCheckSchedulerConvergenceClient,
  scheduleId: string,
): Promise<RankCheckSingletonRetirementStatus> {
  try {
    const handle = client.getHandle(scheduleId);
    const description = await handle.describe();
    if (description.state.paused) return "already_paused";
    await handle.pause("Retired by rank-check scheduler mode convergence");
    return "paused";
  } catch (error) {
    if (isScheduleNotFound(error)) return "absent";
    throw new Error(`Failed to retire rank-check singleton ${scheduleId}.`, { cause: error });
  }
}

function assertSelectedSchedule(status: string, scheduleId: string) {
  if (status === "created" || status === "exists" || status === "updated") return status;
  throw new Error(`Failed to ensure selected rank-check singleton ${scheduleId}: ${status}.`);
}

export async function convergeRankCheckSchedulerSingletons(
  injectedClient?: RankCheckSchedulerConvergenceClient,
): Promise<RankCheckSingletonConvergenceResult> {
  const mode = rankCheckSchedulerMode();
  const client =
    injectedClient ?? ((await getTemporalClient()).schedule as RankCheckSchedulerConvergenceClient);

  if (mode === "legacy") {
    const dispatcher = await retireSingleton(client, RANK_CHECK_DISPATCHER_SCHEDULE_ID);
    const reconciler = assertSelectedSchedule(
      (await ensureReconcilerSchedule(client)).status,
      RECONCILER_SCHEDULE_ID,
    );
    return { dispatcher, mode, reconciler };
  }

  const reconciler = await retireSingleton(client, RECONCILER_SCHEDULE_ID);
  if (mode === "cutover") {
    const dispatcher = await retireSingleton(client, RANK_CHECK_DISPATCHER_SCHEDULE_ID);
    return { dispatcher, mode, reconciler };
  }

  const dispatcher = assertSelectedSchedule(
    (await ensureRankCheckDispatcherSchedule(client)).status,
    RANK_CHECK_DISPATCHER_SCHEDULE_ID,
  );
  return { dispatcher, mode, reconciler };
}
