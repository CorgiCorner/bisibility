import type { Prisma } from "@/lib/generated/prisma/client";

export function activeSnapshotExtensionWhere(now = new Date()): Prisma.RankCheckWhereInput {
  return {
    AND: [
      { raw: { path: ["snapshotExtension", "state"], equals: "running" } },
      { raw: { path: ["snapshotExtension", "leaseUntil"], gt: now.toISOString() } },
    ],
  };
}
