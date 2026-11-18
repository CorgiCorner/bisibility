import "server-only";
import { prisma } from "@/lib/db/prisma";
import { setLocalMonitorScheduleIntent } from "@/lib/local-monitor-store/schedule";
import { monitorRef } from "@/lib/local-monitor-store/schema";
import type {
  LocalDatabase,
  LocalStoreContext,
  LocalTransaction,
} from "@/lib/local-monitoring-store/context";
import { localToken, projectRef } from "@/lib/local-monitoring-store/schema";
import { z } from "zod";
export const pauseRecurringSchema = z
  .object({
    projectId: projectRef,
    monitorId: monitorRef,
    expectedVersion: z.number().int().nonnegative(),
    idempotencyKey: localToken.max(128),
  })
  .strict();
/** Existing append-only intent invalidates future first-send authority; original accepted-ID reads survive. */
export function pauseRecurringMonitor(
  input: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
  tx?: LocalTransaction,
) {
  return appendPausedIntent(input, context, db, false, tx);
}

/** The only paused intent that may replace an archived one. */
export function restoreRecurringMonitor(
  input: unknown,
  context: LocalStoreContext,
  db: LocalDatabase = prisma,
  tx?: LocalTransaction,
) {
  return appendPausedIntent(input, context, db, true, tx);
}

function appendPausedIntent(
  input: unknown,
  context: LocalStoreContext,
  db: LocalDatabase,
  restore: boolean,
  tx?: LocalTransaction,
) {
  const command = pauseRecurringSchema.parse(input);
  return setLocalMonitorScheduleIntent(
    {
      ...command,
      mode: "paused",
      scheduleId: null,
      expectedScheduleEpoch: null,
      consentToken: null,
    },
    context,
    {
      verify: async () => {
        throw new Error("Paused intent has no paid authority.");
      },
    },
    { db, tx, ...(restore ? { restore: true } : {}) },
  );
}
