import "server-only";

import { prisma } from "@/lib/db/prisma";
import { projectLabel } from "@/lib/ops/labels";
import { notifyOps, shouldNotifyOpsSuccess } from "@/lib/ops/notify";
import type { ProviderFailureClass } from "@/lib/providers/failure-class";
import { shouldEscalateTrafficFailure } from "./failure-escalation";
import { isTransientTrafficFailure, isUserActionableTrafficFailure } from "./failure-policy";
import type { TrafficSnapshotSyncMetrics } from "./snapshots";
import type { TrafficConnectionRun, TrafficSyncRunStatus } from "./sync";

type OperationalConnection = { id: string; provider: string };

export async function recordTrafficOperationalRun(input: {
  connection: OperationalConnection;
  error?: string;
  errorClass?: ProviderFailureClass;
  finishedAt: Date;
  metrics: TrafficSnapshotSyncMetrics;
  projectId: string;
  scheduledFor: Date | null;
  startedAt: Date;
  status: TrafficSyncRunStatus;
}) {
  await prisma.operationalRun.create({
    data: {
      connectionId: input.connection.id,
      error: input.error,
      errorClass: input.errorClass,
      finishedAt: input.finishedAt,
      kind: "traffic_sync",
      meta: input.metrics,
      projectId: input.projectId,
      provider: input.connection.provider,
      scheduledFor: input.scheduledFor,
      startedAt: input.startedAt,
      status: input.status,
    },
  });
}

async function shouldSendFailure(input: { now: Date; run: TrafficConnectionRun }) {
  if (isUserActionableTrafficFailure(input.run.errorClass)) return false;
  if (!isTransientTrafficFailure(input.run.errorClass)) return true;
  return shouldEscalateTrafficFailure({
    connectionId: input.run.connectionId,
    now: input.now,
    provider: input.run.provider,
  });
}

export async function notifyTrafficRun(projectId: string, run: TrafficConnectionRun, now: Date) {
  if (run.status === "not_applicable" || run.status === "skipped_needs_reauth") return;
  const successful = run.status === "succeeded_with_data" || run.status === "succeeded_empty";
  if (successful && !shouldNotifyOpsSuccess()) return;
  if (run.status === "failed" && !(await shouldSendFailure({ now, run }))) return;

  await notifyOps({
    ...(successful ? {} : { dedupeKey: `sync:${projectId}:${run.provider}` }),
    fields: {
      Connection: run.connectionId,
      ...(run.errorClass ? { "Error class": run.errorClass } : {}),
      Project: projectLabel(projectId),
      Provider: run.provider,
      Rows: `fetched=${run.rowsFetched}, matched=${run.rowsMatched}, upserted=${run.rowsUpserted}`,
    },
    kind: "traffic_sync",
    severity:
      run.status === "failed" ? "error" : run.status === "deferred_rate_limit" ? "warning" : "info",
    title: `Traffic sync: ${run.status.replaceAll("_", " ")}`,
  }).catch(() => undefined);
}
