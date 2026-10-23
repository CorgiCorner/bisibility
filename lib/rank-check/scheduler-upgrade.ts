import {
  requireExactUpgradeInventory,
  type SchedulerUpgradeInventory,
} from "./scheduler-upgrade-unknown";

export type SchedulerUpgradeStore = {
  inventory(): Promise<SchedulerUpgradeInventory>;
  conflicts(): Promise<string[]>;
  conflictDetails?(): Promise<unknown[]>;
  pauseSingletons(): Promise<unknown>;
  pauseOwned(id: string): Promise<unknown>;
  running(): Promise<number>;
  activate(): Promise<unknown>;
  close?(): Promise<void>;
};

export async function upgradeRankScheduler(
  store: SchedulerUpgradeStore,
  options: { apply: boolean; workersStopped: boolean; acceptPausedUnknown?: boolean },
) {
  const before = await store.inventory();
  const conflicts = await store.conflicts();
  let inventoryBlocked = false;
  try {
    requireExactUpgradeInventory(before, !!options.acceptPausedUnknown);
  } catch {
    inventoryBlocked = true;
  }
  const report = {
    legacySchedules: before.ownedIds.length,
    conflicts,
    applied: false,
    ...(before.unknownSchedules
      ? {
          unknownSchedules: before.unknownSchedules,
          inventoryFailures: before.failed,
          inventoryBlocked,
        }
      : {}),
    ...(store.conflictDetails ? { conflictDetails: await store.conflictDetails() } : {}),
  };
  if (!options.apply) return report;
  requireExactUpgradeInventory(before, !!options.acceptPausedUnknown);
  if (!options.workersStopped)
    throw new Error("Stop all app and worker processes; pass --workers-stopped.");
  if (conflicts.length)
    throw new Error(
      `Resolve schedule conflicts before upgrade: ${conflicts.join(", ")}. Run --dry-run for reasons and legacy/named settings, or --dry-run --repair-assignments for missing membership.`,
    );

  // Stop producers before pausing their output. A failed or interrupted run stays stopped.
  await store.pauseSingletons();
  for (const id of before.ownedIds) await store.pauseOwned(id);
  const after = await store.inventory();
  requireExactUpgradeInventory(after, !!options.acceptPausedUnknown);
  if (after.unrelatedHash !== before.unrelatedHash)
    throw new Error("Unrelated Schedule inventory changed; retry the offline upgrade.");
  if (after.reconciler === "active" || after.ownedIds.length !== after.pausedOwnedIds.length) {
    throw new Error("Legacy scheduling is still active; leave cutover mode configured and retry.");
  }
  if (await store.running())
    throw new Error(
      "Rank workflows are still running. Drain them using the new worker in cutover mode, stop it, then retry.",
    );
  // Re-read intent immediately before activation; never infer that a missing assignment is manual.
  if ((await store.conflicts()).length)
    throw new Error("Schedule intent changed; retry the offline upgrade.");
  await store.activate();
  return { ...report, applied: true };
}
