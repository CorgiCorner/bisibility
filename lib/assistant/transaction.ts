import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Meter admission and settlement share a bounded transaction even under a loaded host. */
export function assistantTransaction<T>(body: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(body, { timeout: 30000, maxWait: 10000 });
}
