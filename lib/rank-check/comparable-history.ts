import { whereComparableTo } from "@/lib/checks/status";
import { prisma } from "@/lib/db/prisma";
import { CURRENT_RANK_NORMALIZATION_VERSION } from "./normalization-version";

export async function findComparablePredecessor(
  keywordId: string,
  check: { normalizationVersion: string | null; requestedDepth: number | null },
) {
  const comparableWhere = whereComparableTo(check);
  if (!comparableWhere) return null;
  return prisma.rankCheck.findFirst({
    orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
    where: { keywordId, ...comparableWhere },
  });
}

export function findCurrentComparablePredecessor(keywordId: string, requestedDepth: number) {
  return findComparablePredecessor(keywordId, {
    normalizationVersion: CURRENT_RANK_NORMALIZATION_VERSION,
    requestedDepth,
  });
}
