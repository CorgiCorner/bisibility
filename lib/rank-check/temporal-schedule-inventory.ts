import "server-only";

import { createHash } from "node:crypto";
import { getSchedulerTemporalClient } from "@/lib/temporal/scheduler-client";
import type { Client, ScheduleDescription } from "@temporalio/client";
import { classifyRankCheckSchedule, listSummaryContradiction } from "./temporal-schedule-ownership";
import type { RankCheckScheduleInventory } from "./temporal-schedule-retirement";

export const TEMPORAL_SYSTEM_SCHEDULER_QUERY =
  'TemporalNamespaceDivision = "TemporalScheduler" AND WorkflowType = ' +
  '"temporal-sys-scheduler-workflow" AND ExecutionStatus = "Running"';

export type ScheduleInventoryClient = Pick<Client["schedule"], "getHandle" | "list">;

function hashIds(ids: readonly string[]) {
  return createHash("sha256")
    .update([...ids].sort().join("\n"))
    .digest("hex");
}

function scheduleNotFound(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "ScheduleNotFoundError"
  );
}

export async function inventoryRankCheckSchedules(
  pageSize: number,
  injectedClient?: ScheduleInventoryClient,
): Promise<RankCheckScheduleInventory> {
  const client = injectedClient ?? (await getSchedulerTemporalClient()).schedule;
  const ambiguousIds: string[] = [];
  const ownedIds: string[] = [];
  const pausedOwnedIds: string[] = [];
  const unrelatedIds: string[] = [];
  let failed = 0;
  let inspected = 0;
  let listed = 0;
  let dispatcher: RankCheckScheduleInventory["dispatcher"] = "absent";
  let reconciler: RankCheckScheduleInventory["reconciler"] = "absent";

  for await (const summary of client.list({ pageSize })) {
    listed += 1;
    try {
      const description = await client.getHandle(summary.scheduleId).describe();
      inspected += 1;
      const classification = classifyRankCheckSchedule(description);
      const listContradiction = listSummaryContradiction(summary, description);
      if (classification.classification === "owned" && listContradiction) {
        ambiguousIds.push(summary.scheduleId);
      } else if (classification.classification === "owned") {
        ownedIds.push(summary.scheduleId);
        if (description.state.paused) pausedOwnedIds.push(summary.scheduleId);
      } else if (classification.classification === "ambiguous") {
        ambiguousIds.push(summary.scheduleId);
      } else if (classification.classification === "singleton") {
        reconciler = description.state.paused ? "paused" : "active";
      } else if (classification.classification === "dispatcher-singleton") {
        dispatcher = description.state.paused ? "paused" : "active";
      } else {
        unrelatedIds.push(summary.scheduleId);
      }
    } catch {
      failed += 1;
    }
  }
  ownedIds.sort();
  pausedOwnedIds.sort();
  ambiguousIds.sort();
  unrelatedIds.sort();
  return {
    ambiguousIds,
    dispatcher,
    failed,
    inspected,
    listed,
    ownedIds,
    pausedOwnedIds,
    reconciler,
    unrelatedHash: hashIds(unrelatedIds),
    unrelatedIds,
  };
}

async function ownedDescription(
  scheduleId: string,
  client: ScheduleInventoryClient,
): Promise<ScheduleDescription | null> {
  try {
    const description = await client.getHandle(scheduleId).describe();
    if (classifyRankCheckSchedule(description).classification !== "owned") {
      throw new Error(`Schedule ${scheduleId} no longer satisfies exact ownership invariants.`);
    }
    return description;
  } catch (error) {
    if (scheduleNotFound(error)) return null;
    throw error;
  }
}

export async function pauseOwnedRankCheckSchedule(
  scheduleId: string,
  injectedClient?: ScheduleInventoryClient,
) {
  const client = injectedClient ?? (await getSchedulerTemporalClient()).schedule;
  const description = await ownedDescription(scheduleId, client);
  if (!description) return "absent";
  if (description.state.paused) return "already_paused";
  await client.getHandle(scheduleId).pause("D1 owned rank-check Schedule retirement");
  return "paused";
}

export async function deleteOwnedRankCheckSchedule(
  scheduleId: string,
  injectedClient?: ScheduleInventoryClient,
) {
  const client = injectedClient ?? (await getSchedulerTemporalClient()).schedule;
  if (!(await ownedDescription(scheduleId, client))) return "absent";
  await client.getHandle(scheduleId).delete();
  return "deleted";
}

export async function countTemporalSystemSchedulers(injectedClient?: Client) {
  const client = injectedClient ?? (await getSchedulerTemporalClient());
  return (await client.workflow.count(TEMPORAL_SYSTEM_SCHEDULER_QUERY)).count;
}
