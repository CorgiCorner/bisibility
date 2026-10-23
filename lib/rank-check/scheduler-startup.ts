import "server-only";

import {
  convergeRankCheckSchedulerSingletons,
  retireLegacyRankCheckReconciler,
} from "@/lib/temporal/rank-check-scheduler-convergence";
import { getSchedulerTemporalClient } from "@/lib/temporal/scheduler-client";
import { type RankCheckSchedulerMode, rankCheckSchedulerMode } from "./scheduler-mode";
import type { SchedulerUpgradeStore } from "./scheduler-upgrade";
import { repairMissingScheduleAssignments } from "./scheduler-upgrade-repair";
import { createSchedulerUpgradeStore } from "./scheduler-upgrade-store";

export type SchedulerStartupStore = Pick<
  SchedulerUpgradeStore,
  "inventory" | "pauseOwned" | "activate"
> & {
  retireReconciler(): Promise<unknown>;
  repair(): Promise<{ assignments: { assigned: boolean }[] }>;
};

// Old worker processes must be stopped before this version starts polling.
export async function upgradeRankSchedulerAtStartup(store: SchedulerStartupStore) {
  await store.retireReconciler();
  const inventory = await store.inventory();
  if (inventory.failed)
    throw new Error("Could not inspect legacy schedules; worker startup will retry.");
  const unknown = new Set([
    ...inventory.ambiguousIds,
    ...(inventory.unknownSchedules ?? []).map((schedule) => schedule.id),
  ]);
  let paused = 0;
  for (const id of inventory.ownedIds) {
    if (unknown.has(id)) continue;
    await store.pauseOwned(id);
    paused += 1;
  }
  const repair = await store.repair();
  const schedulers = await store.activate();
  return {
    schedulers,
    pausedLegacySchedules: paused,
    recoveredKeywords: repair.assignments.filter((assignment) => assignment.assigned).length,
    unrecognizedSchedules: unknown.size,
  };
}

export async function startRankCheckSchedulers(
  mode: RankCheckSchedulerMode = rankCheckSchedulerMode(),
) {
  const client = await getSchedulerTemporalClient();
  if (mode === "cutover") return convergeRankCheckSchedulerSingletons(client.schedule, mode);
  const result = await upgradeRankSchedulerAtStartup({
    ...createSchedulerUpgradeStore(client),
    retireReconciler: () => retireLegacyRankCheckReconciler(client.schedule),
    repair: () =>
      repairMissingScheduleAssignments(true, undefined, { createMissing: true, automatic: true }),
  });
  console.info("[temporal] automatic rank scheduler upgrade", {
    pausedLegacySchedules: result.pausedLegacySchedules,
    recoveredKeywords: result.recoveredKeywords,
    unrecognizedSchedules: result.unrecognizedSchedules,
  });
  if (result.unrecognizedSchedules)
    console.warn(
      "[temporal] Unrecognized schedules were left untouched. New workers block legacy rank execution; inspect with npm run scheduler:upgrade -- --list-unknown.",
    );
  return result.schedulers as Awaited<ReturnType<typeof convergeRankCheckSchedulerSingletons>>;
}
