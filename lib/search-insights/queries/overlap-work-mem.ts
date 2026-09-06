import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";

const DEFAULT_OVERLAP_WORK_MEM_MB = 16;
// This statement has one measured sort: 4 MiB preserves the normal floor, while 32 MiB caps the
// default three-connection SSR pool at 96 MiB of overlap-sort memory on the 1 GiB database.
const MIN_OVERLAP_WORK_MEM_MB = 4;
const MAX_OVERLAP_WORK_MEM_MB = 32;

type OverlapTransaction = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;

export function overlapWorkMemMb(value = process.env.SEARCH_INSIGHTS_OVERLAP_WORK_MEM_MB) {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_OVERLAP_WORK_MEM_MB;
  if (!/^\d+$/.test(trimmed)) {
    throw new Error("SEARCH_INSIGHTS_OVERLAP_WORK_MEM_MB must be an integer");
  }

  const parsed = Number(trimmed);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < MIN_OVERLAP_WORK_MEM_MB ||
    parsed > MAX_OVERLAP_WORK_MEM_MB
  ) {
    throw new Error(
      `SEARCH_INSIGHTS_OVERLAP_WORK_MEM_MB must be between ${MIN_OVERLAP_WORK_MEM_MB} and ${MAX_OVERLAP_WORK_MEM_MB}`,
    );
  }
  return parsed;
}

export async function withOverlapWorkMem<T>(
  query: (transaction: OverlapTransaction) => Promise<T>,
) {
  const megabytes = overlapWorkMemMb();
  return prisma.$transaction(async (transaction) => {
    // Only the bounded integer above reaches this raw SET string, never environment text.
    await transaction.$executeRaw(Prisma.raw(`SET LOCAL work_mem = '${megabytes}MB'`));
    return query(transaction);
  });
}
