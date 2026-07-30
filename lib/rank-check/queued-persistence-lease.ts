import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { RankCheckClosedBeforePersistenceError } from "./persistence-errors";
import { QUEUED_PERSISTENCE_LEASE_MS } from "./queued-timeouts";

export { QUEUED_PERSISTENCE_LEASE_MS } from "./queued-timeouts";

export type QueuedPersistenceLease = {
  expiresAt: Date;
  owner: string;
  taskId: string;
};

type LeaseClient = Pick<Prisma.TransactionClient, "$queryRaw" | "queuedRankCheckTask">;

export async function claimQueuedPersistenceLease(
  taskId: string,
  client: LeaseClient = prisma,
): Promise<QueuedPersistenceLease | null> {
  const owner = randomUUID();
  const claimed = await client.$queryRaw<Array<{ expiresAt: Date }>>(Prisma.sql`
    UPDATE "queued_rank_check_tasks"
    SET "persistenceLeaseExpiresAt" =
          CURRENT_TIMESTAMP + ${QUEUED_PERSISTENCE_LEASE_MS} * INTERVAL '1 millisecond',
        "persistenceLeaseOwner" = ${owner},
        "state" = 'persisting',
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${taskId}
      AND (
        (
          "persistenceLeaseExpiresAt" IS NULL
          AND "persistenceLeaseOwner" IS NULL
          AND "state" IN ('provider_failed', 'ready')
        )
        OR (
          "persistenceLeaseExpiresAt" <= CURRENT_TIMESTAMP
          AND "persistenceLeaseOwner" IS NOT NULL
          AND "state" = 'persisting'
        )
      )
    RETURNING "persistenceLeaseExpiresAt" AS "expiresAt"
  `);
  const row = claimed[0];
  return row ? { expiresAt: row.expiresAt, owner, taskId } : null;
}

export async function assertQueuedPersistenceLease(
  tx: Prisma.TransactionClient,
  lease: QueuedPersistenceLease,
) {
  const owned = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "queued_rank_check_tasks"
    WHERE "id" = ${lease.taskId}
      AND "state" = 'persisting'
      AND "persistenceLeaseOwner" = ${lease.owner}
      AND "persistenceLeaseExpiresAt" > CURRENT_TIMESTAMP
    FOR UPDATE
  `);
  if (owned.length !== 1) throw new RankCheckClosedBeforePersistenceError();
}

export async function transitionQueuedPersistenceLease(
  lease: QueuedPersistenceLease,
  from: string[],
  data: { error?: string | null; state: string },
  client: LeaseClient = prisma,
) {
  const changed =
    data.error === undefined
      ? await client.$queryRaw<Array<{ state: string }>>(Prisma.sql`
          UPDATE "queued_rank_check_tasks"
          SET "state" = ${data.state},
              "persistenceLeaseExpiresAt" = NULL,
              "persistenceLeaseOwner" = NULL,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${lease.taskId}
            AND "persistenceLeaseOwner" = ${lease.owner}
            AND "persistenceLeaseExpiresAt" > CURRENT_TIMESTAMP
            AND "state" IN (${Prisma.join(from)})
          RETURNING "state"
        `)
      : await client.$queryRaw<Array<{ state: string }>>(Prisma.sql`
          UPDATE "queued_rank_check_tasks"
          SET "state" = ${data.state},
              "error" = ${data.error},
              "persistenceLeaseExpiresAt" = NULL,
              "persistenceLeaseOwner" = NULL,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE "id" = ${lease.taskId}
            AND "persistenceLeaseOwner" = ${lease.owner}
            AND "persistenceLeaseExpiresAt" > CURRENT_TIMESTAMP
            AND "state" IN (${Prisma.join(from)})
          RETURNING "state"
        `);
  if (changed.length === 1) return changed[0]?.state ?? data.state;
  const authoritative = await client.queuedRankCheckTask.findUniqueOrThrow({
    select: { state: true },
    where: { id: lease.taskId },
  });
  return authoritative.state;
}
