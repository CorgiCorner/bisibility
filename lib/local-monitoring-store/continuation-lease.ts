import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { auditLocal } from "./audit";
import { requireLocalTime } from "./canonical";
import type { LocalDatabase, LocalStoreContext, LocalTransaction } from "./context";
import { assertLocalCustody } from "./custody";
import { LocalMeasurementConflictError } from "./errors";
import { localItemRefSchema, localItemScope } from "./item-scope";
import { assertLocalTargetOwner } from "./ownership";

const leaseSchema = localItemRefSchema
  .extend({
    expectedVersion: z.number().int().nonnegative(),
    purpose: z.enum(["collect", "reconcile"]),
  })
  .strict();
export type LocalContinuationLease = Readonly<{
  projectId: string;
  runId: string;
  itemId: string;
  targetId: string;
  key: string;
  token: string;
  version: number;
  expiresAt: string;
  purpose: "collect" | "reconcile";
}>;

/** Worker expiry changes only continuation ownership. It never obtains another submit grant. */
export async function claimLocalContinuation(
  command: unknown,
  context: LocalStoreContext,
  options: { ttlMs: number; clock: () => Date },
  db: LocalDatabase = prisma,
): Promise<LocalContinuationLease> {
  const data = leaseSchema.parse(command);
  if (!Number.isSafeInteger(options.ttlMs) || options.ttlMs < 1 || options.ttlMs > 300_000)
    throw new RangeError("Invalid bounded continuation lease.");
  return db.$transaction(async (tx) => {
    const { scope, run, item, record } = await localItemScope(tx, context, data);
    const owner = await assertLocalTargetOwner(tx, scope.project.id, item.targetId, item.id);
    if (owner.version !== data.expectedVersion) throw new LocalMeasurementConflictError();
    await assertLocalCustody(tx, item, record);
    if (
      data.purpose === "collect" &&
      (!record.outcome?.taskIds.length ||
        !record.settlementRecorded ||
        !["accepted", "unknown_acceptance"].includes(record.status))
    )
      throw new Error("Retained accepted tasks are required for collection.");
    const now = requireLocalTime(options.clock());
    if (owner.workerExpiresAt && owner.workerExpiresAt > now)
      throw new LocalMeasurementConflictError();
    const expires = new Date(now.getTime() + options.ttlMs);
    const token = randomUUID();
    const changed = await tx.localMeasurementTargetOwner.updateMany({
      where: {
        projectId: scope.project.id,
        targetId: item.targetId,
        itemId: item.id,
        version: owner.version,
      },
      data: { version: { increment: 1 }, workerToken: token, workerExpiresAt: expires },
    });
    if (changed.count !== 1) throw new LocalMeasurementConflictError();
    await auditLocal(tx, scope, {
      action: "local_measurement.lease_claim",
      targetType: "local_measurement_run",
      targetId: run.publicId,
      after: { version: owner.version + 1, state: data.purpose, count: 1 },
    });
    return {
      projectId: scope.project.id,
      runId: run.id,
      itemId: item.id,
      targetId: item.targetId,
      key: item.operationKey,
      token,
      version: owner.version + 1,
      expiresAt: expires.toISOString(),
      purpose: data.purpose,
    };
  });
}
export async function assertLocalContinuationLease(
  tx: LocalTransaction,
  lease: LocalContinuationLease,
  now: Date,
) {
  const owner = await assertLocalTargetOwner(tx, lease.projectId, lease.targetId, lease.itemId);
  if (
    owner.workerToken !== lease.token ||
    owner.version !== lease.version ||
    !owner.workerExpiresAt ||
    owner.workerExpiresAt.toISOString() !== lease.expiresAt ||
    owner.workerExpiresAt <= requireLocalTime(now)
  )
    throw new LocalMeasurementConflictError();
}
