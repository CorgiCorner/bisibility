import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import {
  activeMarketLocationIds,
  type RunnableKeywordRow,
  unrunnableKeywordReason,
} from "./runnable";
import type { UnrunnableReason } from "./runnable-reasons";

const UNRUNNABLE_MESSAGES = {
  keyword_archived: "The keyword was archived before the queued batch could start.",
  market_inactive: "The market for these keywords is no longer active.",
} as const satisfies Record<UnrunnableReason, string>;

/**
 * The deferral message for the first keyword of a batch that stopped being runnable, or `null`
 * when every keyword may still be bought. A batch is grouped by market, so a paused market
 * always covers the whole batch.
 */
export async function unrunnableBatchReason(
  tx: Prisma.TransactionClient,
  projectId: string,
  keywords: RunnableKeywordRow[],
) {
  const activeLocationIds = await activeMarketLocationIds(projectId, tx);
  for (const keyword of keywords) {
    const reason = unrunnableKeywordReason(keyword, activeLocationIds);
    if (reason) return UNRUNNABLE_MESSAGES[reason];
  }
  return null;
}
