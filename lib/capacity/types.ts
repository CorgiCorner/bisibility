import type { Prisma } from "@/lib/generated/prisma/client";

export type CapacityRequest = {
  additional: number;
  projectId?: string;
  /** Read current usage with the supplied transaction after its capacity lock is held. */
  countUsed: (tx: Prisma.TransactionClient) => Promise<number>;
};
