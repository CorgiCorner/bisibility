import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
export function deploymentRecoveryInventory(
  _scope: { namespace: string; instanceId: string },
  _cutoff: Date,
) {
  return Prisma.empty;
}
