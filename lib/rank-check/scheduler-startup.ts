import "server-only";

import {
  convergeRankCheckSchedulerSingletons,
  retireLegacyRankCheckReconciler,
} from "@/lib/temporal/rank-check-scheduler-convergence";
import { getSchedulerTemporalClient } from "@/lib/temporal/scheduler-client";
import { type RankCheckSchedulerMode, rankCheckSchedulerMode } from "./scheduler-mode";
import type { SchedulerUpgradeStore } from "./scheduler-upgrade";
import { createSchedulerUpgradeStore } from "./scheduler-upgrade-store";

export type SchedulerStartupStore = Pick<SchedulerUpgradeStore, "inventory" | "activate"> & {
  retireReconciler(): Promise<unknown>;
};

// Old worker processes must be stopped before this version starts polling.
export async function upgradeRankSchedulerAtStartup(store: SchedulerStartupStore) {
  const inventory = await store.inventory();
  if (inventory.failed)
    throw new Error("Could not inspect legacy schedules; worker startup will retry.");
  const unknown = new Set([
    ...inventory.ambiguousIds,
    ...(inventory.unknownSchedules ?? []).map((schedule) => schedule.id),
  ]);
  const paused = new Set(inventory.pausedOwnedIds);
  const activeOwnedSchedules = inventory.ownedIds.filter(
    (id) => !unknown.has(id) && !paused.has(id),
  );
  if (inventory.reconciler === "active" || activeOwnedSchedules.length) {
    console.error("[temporal] legacy rank scheduler upgrade required", {
      activeOwnedSchedules,
      membershipRepair: "disabled",
    });
    throw new Error(
      "Complete the offline scheduler upgrade (npm run scheduler:upgrade) before starting dispatcher mode.",
    );
  }
  await store.retireReconciler();
  const schedulers = await store.activate();
  return {
    schedulers,
    ownedLegacySchedules: inventory.ownedIds.filter((id) => !unknown.has(id)).length,
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
  });
  console.info("[temporal] rank scheduler startup", {
    membershipRepair: "disabled",
    ownedLegacySchedules: result.ownedLegacySchedules,
    unrecognizedSchedules: result.unrecognizedSchedules,
  });
  if (result.unrecognizedSchedules)
    console.warn(
      "[temporal] Unrecognized schedules were left untouched. New workers block legacy rank execution; inspect with npm run scheduler:upgrade -- --list-unknown.",
    );
  return result.schedulers as Awaited<ReturnType<typeof convergeRankCheckSchedulerSingletons>>;
}
