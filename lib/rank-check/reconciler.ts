import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import { RECONCILER_SCHEDULE_ID } from "@/lib/temporal/bootstrap";
import { getSchedulerTemporalClient } from "@/lib/temporal/scheduler-client";
import type { ReconcileResult } from "./reconcile-result";
import { isScheduledFrequency, type RankCheckScheduleInput } from "./schedule";
import { legacySchedulingAllowed } from "./scheduler-mode";
import {
  deleteRankCheckSchedule,
  rankCheckScheduleId,
  syncRankCheckScheduleNonFatal,
  type TemporalScheduleClient,
} from "./temporal-schedule";

export type { ReconcileResult } from "./reconcile-result";

// Worker-side schedule reconciler. The app only writes INTENT (KeywordSchedule /
// ProjectDefaults) to Postgres; this sweep converges the per-keyword Temporal
// Schedules to match that intent and prunes anything stale. It is the single
// owner of `rank-check-<keywordId>` Schedules, so the app never needs to reach
// the (firewalled) Temporal gRPC frontend directly. Reuses the existing
// temporal-schedule.ts helpers for the actual create/update/delete calls.

const SCHEDULE_PREFIX = "rank-check-";
const scheduleSelect = {
  cronExpression: true,
  frequency: true,
  jitterMinutes: true,
  nextCheckAt: true,
  timezone: true,
} as const;

type ScheduleRow = {
  cronExpression: string | null;
  frequency: RankCheckScheduleInput["frequency"];
  jitterMinutes: number;
  nextCheckAt?: Date | null;
  timezone: string;
};

/** Client surface the reconciler needs: the sync helpers plus schedule listing. */
export type ReconcilerScheduleClient = TemporalScheduleClient & {
  list(): AsyncIterable<{ scheduleId: string }>;
};

function toScheduleInput(row: ScheduleRow | null | undefined): RankCheckScheduleInput | null {
  if (!row) {
    return null;
  }

  return {
    cronExpression: row.cronExpression,
    frequency: row.frequency,
    jitterMinutes: row.jitterMinutes,
    nextCheckAt: row.nextCheckAt ?? null,
    timezone: row.timezone,
  } satisfies RankCheckScheduleInput;
}

async function scheduleClient(
  client?: ReconcilerScheduleClient,
): Promise<ReconcilerScheduleClient> {
  if (client) {
    return client;
  }

  return (await getSchedulerTemporalClient()).schedule as unknown as ReconcilerScheduleClient;
}

type IntentSweep = {
  desired: Set<string>;
  created: number;
  updated: number;
  failed: number;
  scanned: number;
};

async function reconcileIntent(temporal: ReconcilerScheduleClient): Promise<IntentSweep> {
  const keywords = await prisma.keyword.findMany({
    select: {
      id: true,
      projectId: true,
      project: {
        select: {
          defaults: { select: scheduleSelect },
          owner: { select: { deactivatedAt: true } },
          writeMode: true,
        },
      },
      schedule: { select: scheduleSelect },
    },
  });

  const sweep: IntentSweep = { created: 0, desired: new Set(), failed: 0, scanned: 0, updated: 0 };

  for (const keyword of keywords) {
    sweep.scanned += 1;
    if (keyword.project.owner.deactivatedAt || isProjectReadOnly(keyword.project.writeMode)) {
      continue;
    }
    const schedule = toScheduleInput(keyword.schedule ?? keyword.project.defaults);

    // Deactivated owners, manual / paused / no-intent keywords are intentionally
    // left out of the desired set; prune deletes any Schedule that exists for them.
    if (!schedule || !isScheduledFrequency(schedule.frequency)) {
      continue;
    }

    sweep.desired.add(rankCheckScheduleId(keyword.id));
    const result = await syncRankCheckScheduleNonFatal(
      { keywordId: keyword.id, projectId: keyword.projectId, schedule },
      temporal,
    );

    if (!result) {
      sweep.failed += 1;
    } else if (result.status === "created") {
      sweep.created += 1;
    } else if (result.status === "updated") {
      sweep.updated += 1;
    }
  }

  return sweep;
}

async function pruneStaleSchedules(
  temporal: ReconcilerScheduleClient,
  desired: Set<string>,
): Promise<{ deleted: number; listed: number }> {
  const reserved = new Set([RECONCILER_SCHEDULE_ID]);
  const orphanIds: string[] = [];
  let listed = 0;

  for await (const summary of temporal.list()) {
    const id = summary.scheduleId;
    if (!id.startsWith(SCHEDULE_PREFIX)) {
      continue;
    }

    listed += 1;
    if (reserved.has(id) || desired.has(id)) {
      continue;
    }

    orphanIds.push(id);
  }

  let deleted = 0;
  for (const id of orphanIds) {
    const keywordId = id.slice(SCHEDULE_PREFIX.length);
    const result = await deleteRankCheckSchedule(keywordId, temporal).catch((error) => {
      console.error("[temporal] reconciler prune failed", { error, scheduleId: id });
      return null;
    });

    if (result && (result.status === "deleted" || result.status === "missing")) {
      deleted += 1;
    }
  }

  return { deleted, listed };
}

/**
 * Converge keyword schedules and prune orphans while preserving `rank-check-reconciler`.
 */
export async function reconcileAllSchedules(
  client?: ReconcilerScheduleClient,
): Promise<ReconcileResult> {
  if (!legacySchedulingAllowed()) {
    return { created: 0, deleted: 0, failed: 0, listed: 0, scanned: 0, updated: 0 };
  }
  const temporal = await scheduleClient(client);
  const intent = await reconcileIntent(temporal);
  const prune = await pruneStaleSchedules(temporal, intent.desired);

  return {
    created: intent.created,
    deleted: prune.deleted,
    failed: intent.failed,
    listed: prune.listed,
    scanned: intent.scanned,
    updated: intent.updated,
  };
}
