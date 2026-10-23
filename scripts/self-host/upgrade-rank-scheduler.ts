import type { SchedulerUpgradeStore } from "@/lib/rank-check/scheduler-upgrade";
import { upgradeRankScheduler } from "@/lib/rank-check/scheduler-upgrade";

const args = process.argv.slice(2);
const flags = ["--dry-run", "--apply", "--workers-stopped", "--list-unknown", "--accept-paused-unknown", "--repair-assignments", "--create-missing-schedules"];
if (args.some((arg) => !flags.includes(arg) && !arg.startsWith("--select-match=")) ||
  ["--dry-run", "--apply", "--list-unknown"].filter((flag) => args.includes(flag)).length !== 1 ||
  (args.includes("--list-unknown") && args.includes("--repair-assignments")) ||
  (!args.includes("--repair-assignments") && args.some((arg) => arg === "--create-missing-schedules" || arg.startsWith("--select-match=")))) {
  throw new Error("Usage: npm run scheduler:upgrade -- --list-unknown | --dry-run [--repair-assignments] | --apply --workers-stopped [--repair-assignments | --accept-paused-unknown]");
}
if (args.includes("--apply") && !args.includes("--workers-stopped")) {
  throw new Error("Stop all app and worker processes; pass --workers-stopped.");
}
if (!process.env.DATABASE_URL || !process.env.TEMPORAL_ADDRESS) {
  throw new Error("Load this installation's DATABASE_URL and TEMPORAL_ADDRESS before the offline upgrade.");
}
// Only this offline operator process may access Temporal while the app and worker are stopped.
process.env.SCHEDULER_DRIVER = "temporal";
process.env.RANK_CHECK_SCHEDULER_MODE = "cutover";
process.env.RANK_CHECK_DISPATCHER_ENABLED = "";
process.env.RANK_CHECK_RECONCILER_ENABLED = "";
let store: SchedulerUpgradeStore | undefined;
try {
  if (args.includes("--repair-assignments")) {
    const { repairMissingScheduleAssignments } = await import("@/lib/rank-check/scheduler-upgrade-repair");
    const selectMatches: Record<string, string> = {};
    for (const arg of args.filter((arg) => arg.startsWith("--select-match="))) {
      const parts = arg.slice("--select-match=".length).split(":");
      if (parts.length !== 2 || !parts[0] || !parts[1] || selectMatches[parts[0]]) throw new Error("Use --select-match=keyword-public-id:schedule-public-id once per keyword.");
      selectMatches[parts[0]] = parts[1];
    }
    const { prisma } = await import("@/lib/db/prisma");
    const report = await repairMissingScheduleAssignments(args.includes("--apply"), prisma, {
      createMissing: args.includes("--create-missing-schedules"), selectMatches,
    });
    console.log(JSON.stringify(report));
    if (report.remainingConflicts.length) process.exitCode = 1;
    console.log("Assignment repair does not activate scheduling. Run --dry-run, resolve remaining conflicts, then run the offline upgrade.");
  } else {
    const { schedulerUpgradeStore } = await import("@/lib/rank-check/scheduler-upgrade-store");
    store = await schedulerUpgradeStore();
    if (args.includes("--list-unknown")) {
      const inventory = await store.inventory();
      console.log(JSON.stringify({ unknownSchedules: inventory.unknownSchedules, inventoryFailures: inventory.failed }));
    } else {
      const result = await upgradeRankScheduler(store, {
        apply: args.includes("--apply"), workersStopped: args.includes("--workers-stopped"),
        acceptPausedUnknown: args.includes("--accept-paused-unknown"),
      });
      console.log(JSON.stringify(result));
      if (result.conflicts.length || result.inventoryBlocked) process.exitCode = 1;
      if (result.applied) {
        process.exitCode = 0;
        console.log("Prepared: set RANK_CHECK_SCHEDULER_MODE=dispatcher on both app and worker, remove retired flags, and start the new release. Paused legacy schedules and history are retained.");
      }
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Scheduler upgrade failed.");
  process.exitCode = 1;
} finally {
  await store?.close?.();
  const { prisma } = await import("@/lib/db/prisma");
  await prisma.$disconnect();
}
