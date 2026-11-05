import "server-only";
import { setTimeout } from "node:timers/promises";
import { isTransientDatabaseReadError } from "@/lib/db/transient-read";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import {
  TASKSET_ADMISSION_MAX_ATTEMPTS,
  TASKSET_ADMISSION_RETRY_DELAY_MS,
  TASKSET_TRANSACTION_OPTIONS,
} from "./taskset-timeouts";

function ownValue(value: object, key: string): unknown {
  try {
    return Object.getOwnPropertyDescriptor(value, key)?.value;
  } catch {
    return undefined;
  }
}

function confirmedRollback(error: unknown) {
  const pending: unknown[] = [error];
  const seen = new Set<object>();
  for (let index = 0; index < pending.length && index < 16; index += 1) {
    const value = pending[index];
    if (!value || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    const code = ownValue(value, "code") ?? ownValue(value, "originalCode");
    if (code === "P2034" || code === "40001" || code === "40P01") return true;
    const meta = ownValue(value, "meta");
    if (code === "P2028" && meta && typeof meta === "object") {
      const timeout = ownValue(meta, "timeout");
      const elapsed = ownValue(meta, "timeTaken");
      if (typeof timeout === "number" && typeof elapsed === "number" && elapsed >= timeout)
        return true;
    }
    for (const key of ["cause", "meta", "driverAdapterError"]) pending.push(ownValue(value, key));
  }
  return false;
}

async function runReplayableTransaction<T>(
  db: Pick<PrismaClient, "$transaction">,
  body: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    let started = false;
    try {
      return await db.$transaction(async (tx) => {
        started = true;
        return body(tx);
      }, TASKSET_TRANSACTION_OPTIONS);
    } catch (error) {
      const safeToRetry = started
        ? confirmedRollback(error)
        : isTransientDatabaseReadError(error) ||
          (error instanceof Error && ownValue(error, "code") === "P2028");
      if (!safeToRetry || attempt >= TASKSET_ADMISSION_MAX_ATTEMPTS) throw error;
      await setTimeout(TASKSET_ADMISSION_RETRY_DELAY_MS * 2 ** (attempt - 1));
    }
  }
}

/** Only atomic, pre-transport admission belongs here. Never retry a fence, POST or settlement. */
export function runUnsentTasksetTransaction<T>(
  db: Pick<PrismaClient, "$transaction">,
  body: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return runReplayableTransaction(db, body);
}

/**
 * Records a provider response that was already received. The body must be a state-guarded
 * business write with no provider I/O, fence or usage settlement inside, so replaying it after a
 * confirmed rollback cannot send or charge again. Losing it would discard the native task
 * identities that are the only reconciliation proof for accepted, possibly charged tasks.
 */
export function runAcceptedTasksetWrite<T>(
  db: Pick<PrismaClient, "$transaction">,
  body: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return runReplayableTransaction(db, body);
}
