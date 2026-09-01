import "server-only";

import { prisma } from "@/lib/db/prisma";
import { SEARCH_INSIGHTS_SOURCE } from "@/lib/search-insights/sync/credentials";
import { searchInsightsProperty } from "./context-model";

export type SearchImportQueueFacts = { blockingPropertyLabel?: string | null };

/** Derive the shared project quota blocker without persisting another queue state. */
export async function readSearchImportQueueFacts(input: {
  createdAt: Date;
  id: string;
  projectId: string;
  state: string;
}): Promise<SearchImportQueueFacts | null> {
  if (input.state !== "queued") return null;
  const blocker = await prisma.searchAnalyticsImport.findFirst({
    orderBy: { createdAt: "asc" },
    select: { property: true },
    where: {
      id: { not: input.id },
      projectId: input.projectId,
      source: SEARCH_INSIGHTS_SOURCE,
      workflowId: { not: null },
      OR: [{ state: "running" }, { createdAt: { lt: input.createdAt }, state: "queued" }],
    },
  });
  if (!blocker) return {};
  return {
    blockingPropertyLabel:
      searchInsightsProperty(blocker.property)?.displayName ?? blocker.property,
  };
}
