import { randomUUID } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";

export function createDeliveryClaimToken() {
  return randomUUID();
}

export async function authorizeDigestRelease(tx: Prisma.TransactionClient, owner: string) {
  await tx.$queryRaw`SELECT set_config('bisibility.digest_release_owner', ${owner}, true)`;
}
