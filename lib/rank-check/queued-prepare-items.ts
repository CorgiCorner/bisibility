import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { QueuedRankCheckWorkflowInput } from "@/lib/temporal/queued-rank-check-contract";
export type ResolvedRunItem = {
  id: string;
  keywordId: string;
  runId: string;
  claimAttempts: number;
  claimExpiresAt: Date | null;
};
export async function resolveRunItems(
  tx: Prisma.TransactionClient,
  input: QueuedRankCheckWorkflowInput,
) {
  if (input.runItemIds && input.runItemIds.length !== input.keywordIds.length) {
    throw new Error("runItemIds must align with keywordIds.");
  }
  if (input.runItemIds && new Set(input.runItemIds).size !== input.runItemIds.length) {
    throw new Error("runItemIds must be unique.");
  }
  if (!input.runItemIds && !input.runId) {
    return { byKeyword: new Map<string, ResolvedRunItem>(), runId: undefined };
  }
  const rows = await tx.rankCheckRunItem.findMany({
    select: {
      id: true,
      keywordId: true,
      runId: true,
      claimAttempts: true,
      claimExpiresAt: true,
      status: true,
      rankCheckId: true,
    },
    where: input.runItemIds
      ? { id: { in: input.runItemIds } }
      : input.runId
        ? { keywordId: { in: input.keywordIds }, runId: input.runId }
        : { id: { in: [] } },
  });
  if (input.runItemIds && rows.length !== input.runItemIds.length) {
    throw new Error("Queued rank-check run item no longer exists.");
  }
  const byId = new Map(rows.map((item) => [item.id, item]));
  const byKeyword = new Map<string, ResolvedRunItem>();
  for (const [index, keywordId] of input.keywordIds.entries()) {
    const itemId = input.runItemIds?.[index];
    const item = itemId ? byId.get(itemId) : rows.find((row) => row.keywordId === keywordId);
    if (!item) continue;
    if (item.keywordId !== keywordId || (input.runId && item.runId !== input.runId)) {
      throw new Error("Queued rank-check run item does not match its keyword or run.");
    }
    const claim = input.runItemClaims?.find((entry) => entry.id === item.id);
    if (
      !claim ||
      item.status !== "running" ||
      item.rankCheckId !== null ||
      !item.claimExpiresAt ||
      item.claimExpiresAt <= new Date() ||
      claim.claimAttempts !== item.claimAttempts ||
      Date.parse(claim.claimExpiresAt) !== item.claimExpiresAt.getTime()
    )
      throw new Error("Original run-item claim changed before preparation.");
    byKeyword.set(keywordId, item);
  }
  const runIds = new Set(rows.map((item) => item.runId));
  if (runIds.size > 1) throw new Error("Queued rank-check batch spans multiple runs.");
  return { byKeyword, runId: rows[0]?.runId };
}
