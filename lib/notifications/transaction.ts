import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { type NotificationRealtimeEvent, publishNotificationCreated } from "./realtime";

const afterCommit = new WeakMap<Prisma.TransactionClient, Array<() => Promise<unknown>>>();

/** Only registered transaction owners may schedule post-commit work. */
export function queueNotificationAfterCommit(
  tx: Prisma.TransactionClient,
  task: () => Promise<unknown>,
) {
  afterCommit.get(tx)?.push(task);
}

const publications = new WeakMap<Prisma.TransactionClient, NotificationRealtimeEvent[]>();

/** External transaction owners use notificationTransaction to flush only committed events. */
export function queueNotificationEvent(
  tx: Prisma.TransactionClient,
  event: NotificationRealtimeEvent,
) {
  const pending = publications.get(tx) ?? [];
  pending.push(event);
  publications.set(tx, pending);
}

export async function notificationTransaction<T>(
  persist: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  },
  database: {
    $transaction<T>(
      persist: (tx: Prisma.TransactionClient) => Promise<T>,
      options?: {
        maxWait?: number;
        timeout?: number;
        isolationLevel?: Prisma.TransactionIsolationLevel;
      },
    ): Promise<T>;
  } = prisma,
): Promise<T> {
  let pending: NotificationRealtimeEvent[] = [];
  const tasks: Array<() => Promise<unknown>> = [];
  const result = await database.$transaction(async (tx) => {
    publications.set(tx, pending);
    afterCommit.set(tx, tasks);
    try {
      return await persist(tx);
    } finally {
      pending = publications.get(tx) ?? [];
      publications.delete(tx);
      afterCommit.delete(tx);
    }
  }, options);
  for (const event of pending) {
    try {
      await publishNotificationCreated(event);
    } catch {
      // Polling reconciles committed state when realtime delivery fails.
    }
  }
  for (const task of tasks) {
    try {
      await task();
    } catch {
      /* Maintenance recovers best-effort recomputations. */
    }
  }
  return result;
}
