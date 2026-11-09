import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

/** Use the same lock order for admission and transfers between accounts. */
export async function lockResourceOwners(tx: Prisma.TransactionClient, ownerIds: string[]) {
  for (const ownerId of [...new Set(ownerIds)].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`resource-capacity:${ownerId}`}))`;
  }
}
