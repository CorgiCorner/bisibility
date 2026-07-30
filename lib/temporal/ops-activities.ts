import "server-only";

import { getOpsConfig } from "@/lib/ops/config";
import {
  readTemporalDigestCounters,
  writeTemporalDigestCounters,
} from "@/lib/ops/heartbeat-counter-state";
import {
  collectDatabaseHeartbeat,
  type DatabaseHeartbeat,
  pruneOperationalObservability,
} from "@/lib/ops/heartbeat-data";
import { buildHeartbeatEvent } from "@/lib/ops/heartbeat-format";
import { collectTemporalHeartbeat, type TemporalHeartbeat } from "@/lib/ops/heartbeat-temporal";
import { refreshWorkerLiveness } from "@/lib/ops/liveness";
import { drainOpsThrottleCounters, notifyOps } from "@/lib/ops/notify";
import { redactOpsText } from "@/lib/ops/slack";
import { sweepUndeliveredOpsEvents } from "@/lib/ops/sweep";
import { isTrafficSyncEnabled, TRAFFIC_SYNC_SCHEDULE_ID } from "@/lib/temporal/traffic-bootstrap";

export type OpsHeartbeatActivityResult = {
  prunedEvents: number;
  prunedRuns: number;
  status: "completed" | "disabled";
  sweepAttempted: number;
  sweepDelivered: number;
};

const workerStartedAt = new Date(Date.now() - process.uptime() * 1000);

function emptyDatabaseHeartbeat(message: string): DatabaseHeartbeat {
  return {
    bootstrapErrors: [message],
    rank: {
      deferred: 0,
      failed: 0,
      lagP50Ms: null,
      lagP95Ms: null,
      scheduled: 0,
      stuck: 0,
      succeeded: 0,
      topFailures: [],
    },
    schedule: { active: 0, dueWithoutRun: 0, tracked: 0 },
    traffic: [],
    undeliveredEvents: 0,
  };
}

function emptyTemporalHeartbeat(message: string): TemporalHeartbeat {
  return {
    inspectionErrors: 1,
    issueSchedules: [message],
    missedCatchupTotal: 0,
    nextActionAt: null,
    recentActions: 0,
    scheduleIssues: [],
    schedules: 0,
    skippedOverlapTotal: 0,
  };
}

function logCollectionFailure(scope: string, error: unknown) {
  console.error(`[ops] ${scope} failed: ${redactOpsText(error)}`);
}

export async function opsHeartbeatActivity(): Promise<OpsHeartbeatActivityResult> {
  if (!getOpsConfig().enabled) {
    return {
      prunedEvents: 0,
      prunedRuns: 0,
      status: "disabled",
      sweepAttempted: 0,
      sweepDelivered: 0,
    };
  }

  const now = new Date();
  await refreshWorkerLiveness(now);
  const sweep = await sweepUndeliveredOpsEvents();
  const [databaseResult, temporalResult, suppressedResult, previousCountersResult] =
    await Promise.allSettled([
      collectDatabaseHeartbeat(now),
      collectTemporalHeartbeat(now),
      drainOpsThrottleCounters(),
      readTemporalDigestCounters(),
    ]);
  const database =
    databaseResult.status === "fulfilled"
      ? databaseResult.value
      : emptyDatabaseHeartbeat("Database heartbeat collection failed.");
  const temporal =
    temporalResult.status === "fulfilled"
      ? temporalResult.value
      : emptyTemporalHeartbeat("Temporal schedule inspection failed.");
  const suppressed = suppressedResult.status === "fulfilled" ? suppressedResult.value : {};
  const temporalCounterState =
    previousCountersResult.status === "fulfilled"
      ? previousCountersResult.value
      : ({ status: "unavailable" } as const);

  if (databaseResult.status === "rejected") {
    logCollectionFailure("database heartbeat collection", databaseResult.reason);
  }
  if (temporalResult.status === "rejected") {
    logCollectionFailure("Temporal schedule inspection", temporalResult.reason);
  }
  if (suppressedResult.status === "rejected") {
    logCollectionFailure("throttle counter drain", suppressedResult.reason);
  }

  await notifyOps(
    buildHeartbeatEvent({
      database,
      now,
      schedulesEnabled: { [TRAFFIC_SYNC_SCHEDULE_ID]: isTrafficSyncEnabled() },
      suppressed,
      sweep,
      temporal,
      temporalCounterState,
      workerStartedAt,
    }),
  );
  if (temporalResult.status === "fulfilled") {
    await writeTemporalDigestCounters(temporal);
  }
  let pruned = { events: 0, runs: 0 };
  try {
    pruned = await pruneOperationalObservability(now);
  } catch (error) {
    logCollectionFailure("observability retention purge", error);
  }

  return {
    prunedEvents: pruned.events,
    prunedRuns: pruned.runs,
    status: "completed",
    sweepAttempted: sweep.attempted,
    sweepDelivered: sweep.delivered,
  };
}
