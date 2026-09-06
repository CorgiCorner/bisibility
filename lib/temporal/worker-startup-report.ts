import "server-only";

import { collectTemporalHeartbeat } from "../ops/heartbeat-temporal";
import { refreshWorkerLiveness } from "../ops/liveness";
import { notifyOps } from "../ops/notify";
import { publishTemporalSnapshot } from "../ops/temporal-snapshot";
import { ensureOpsHeartbeatSchedule } from "./ops-bootstrap";

export type WorkerScheduleResult = { scheduleId: string; status: string };

export async function safeOpsHeartbeatBootstrap(): Promise<WorkerScheduleResult> {
  try {
    return await ensureOpsHeartbeatSchedule();
  } catch {
    console.error("[temporal] ops heartbeat schedule bootstrap failed");
    return { scheduleId: "ops-heartbeat", status: "failed" };
  }
}

export function refreshWorkerHeartbeat() {
  void refreshWorkerLiveness().catch(() => console.error("[ops] periodic liveness refresh failed"));
  void publishTemporalSnapshot(new Date(), collectTemporalHeartbeat);
}

export async function reportWorkerStartup(input: {
  namespace: string;
  schedulerDriver: string;
  schedulerMode: string;
  schedules: WorkerScheduleResult[];
  taskQueues: string[];
}) {
  const failed = input.schedules.filter((schedule) => schedule.status === "failed");
  for (const schedule of failed) {
    await notifyOps({
      fields: { "Schedule ID": schedule.scheduleId, Status: schedule.status },
      kind: "schedule_bootstrap",
      severity: "error",
      title: "Temporal schedule bootstrap failed",
    }).catch(() => console.error("[ops] schedule bootstrap notification failed"));
  }
  const ensured = input.schedules.filter((schedule) =>
    ["created", "exists", "updated"].includes(schedule.status),
  ).length;
  await refreshWorkerLiveness().catch(() => console.error("[ops] liveness refresh failed"));
  await publishTemporalSnapshot(new Date(), collectTemporalHeartbeat);
  await notifyOps({
    fields: {
      "Failed schedules": failed.length,
      Namespace: input.namespace,
      "Rank-check scheduler mode": input.schedulerMode,
      "Scheduler driver": input.schedulerDriver,
      "Task queues": input.taskQueues.join(", "),
    },
    kind: "worker_started",
    severity: "info",
    title: `Worker started - ${ensured} schedules ensured`,
  }).catch(() => console.error("[ops] worker startup notification failed"));
}
