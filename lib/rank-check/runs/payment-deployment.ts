import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
export type RankPaymentTarget = { keywordId: string; cost: number | null; quantity: number };
export type RankPaymentPolicy = { authority: string; prices: Record<string, string> };
export async function quoteRankPayment(
  _provider: string,
  _targets: readonly RankPaymentTarget[],
  _db?: Prisma.TransactionClient,
): Promise<RankPaymentPolicy | null> {
  return null;
}
