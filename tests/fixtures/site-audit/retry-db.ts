import type { PrismaClient } from "@/lib/generated/prisma/client";

export function retryDb() {
  const row = {
    id: "run",
    projectId: "project",
    target: "https://example.com/",
    requestedPages: 15,
    budgetPages: 15,
    generation: 0,
    pagesCrawled: 0,
    state: "queued",
    leaseExpiresAt: null as Date | null,
    leaseToken: null as string | null,
    startedAt: null,
    stopReason: null,
  };
  const run = {
    findUniqueOrThrow: async () => ({ ...row }),
    updateMany: async ({
      where,
      data,
    }: {
      where: {
        OR?: unknown;
        generation?: number;
        state?: string | { in: string[] };
        leaseToken?: string;
        leaseExpiresAt?: { gt: Date };
      };
      data: object;
    }) => {
      if (where.generation !== undefined && row.generation !== where.generation)
        return { count: 0 };
      if (typeof where.state === "string" && row.state !== where.state) return { count: 0 };
      if (typeof where.state === "object" && !where.state.in.includes(row.state))
        return { count: 0 };
      if (where.OR && row.leaseExpiresAt && row.leaseExpiresAt > new Date()) return { count: 0 };
      if (where.leaseToken && row.leaseToken !== where.leaseToken) return { count: 0 };
      if (
        where.leaseExpiresAt?.gt &&
        (!row.leaseExpiresAt || row.leaseExpiresAt <= where.leaseExpiresAt.gt)
      )
        return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  };
  const tx = {
    hostedCrawlReservation: { findUnique: async () => null },
    siteAuditRun: run,
    siteAuditFrontier: {
      updateMany: async () => {
        throw new Error("persistent page-write failure");
      },
    },
  };
  const db = {
    ...tx,
    siteAuditFrontier: {
      ...tx.siteAuditFrontier,
      findFirst: async () => ({ url: row.target, depth: 0 }),
    },
    $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PrismaClient;
  return { db, row, run };
}
