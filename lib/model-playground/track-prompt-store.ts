import "server-only";
import { createPrompt } from "@/lib/ai-tracking/stores/prompts";
import { prepareResourceCapacity } from "@/lib/capacity/capacity-extension";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ModelPlaygroundDatabase } from "./store-db";
import { trackModelPlaygroundRun } from "./track-preset";

/** Same transaction and capacity-owner/project lock order as the production prompt store. */
export function trackModelPlaygroundWithPromptStore(
  db: ModelPlaygroundDatabase,
  input: { projectId: string; runId: string; topicId: string | null },
  onCommitted?: () => void,
) {
  return trackModelPlaygroundRun(
    db,
    input,
    async (transaction, text, topicId) => {
      const tx = transaction as Prisma.TransactionClient;
      const topic = topicId
        ? await tx.aiTopic.findFirst({
            where: { projectId: input.projectId, publicId: topicId, archivedAt: null },
            select: { id: true },
          })
        : null;
      if (topicId && !topic) throw new Error("Selected topic is no longer available.");
      return createPrompt(
        input.projectId,
        { text, topicId: topic?.id ?? null, category: "neutral", paused: true },
        undefined,
        tx,
      );
    },
    async (transaction) => {
      await prepareResourceCapacity(transaction as Prisma.TransactionClient, {
        projectId: input.projectId,
        dimensions: [],
      });
    },
    onCommitted,
  );
}
