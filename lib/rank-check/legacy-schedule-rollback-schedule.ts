import type { Client } from "@temporalio/client";
import {
  buildRankCheckScheduleOptions,
  type SyncRankCheckScheduleInput,
} from "./temporal-schedule";
import { classifyRankCheckSchedule } from "./temporal-schedule-ownership";

function named(error: unknown, name: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === name
  );
}

export async function ensurePausedRollbackScheduleWithClient(
  input: SyncRankCheckScheduleInput,
  temporal: Client["schedule"],
): Promise<"created" | "exact" | "updated"> {
  const options = buildRankCheckScheduleOptions(input);
  const rollbackState = {
    note: "D1 rollback prepared; switch both runtimes to legacy",
    paused: true,
  };
  options.state = rollbackState;
  try {
    await temporal.create(options);
    return "created";
  } catch (error) {
    if (!named(error, "ScheduleAlreadyRunning")) throw error;
  }
  const handle = temporal.getHandle(options.scheduleId);
  let status: "exact" | "updated" = "updated";
  await handle.update((current) => {
    const classification = classifyRankCheckSchedule(current);
    if (
      classification.classification !== "owned" ||
      classification.keywordId !== input.keywordId ||
      classification.projectId !== input.projectId
    ) {
      throw new Error(`Conflicting Schedule ${options.scheduleId} is not exact owned state.`);
    }
    if (current.state.paused) status = "exact";
    return {
      action: options.action,
      policies: options.policies,
      spec: options.spec,
      state: rollbackState,
      typedSearchAttributes: options.typedSearchAttributes,
    };
  });
  return status;
}
