import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { trackedProjectDomain } from "@/lib/schemas/project";
import {
  type AiOverviewItemRow,
  aiOverviewFactsFromRows,
  type RankTrackerAiOverviewFact,
} from "./rank-tracker-ai-overview-facts";
import { aiOverviewPageItemsSql, aiOverviewShownIdsSql } from "./rank-tracker-ai-overview-sql";

/** Shown-id and page-fragment reads stay in batches so one statement does not list every target. */
const AI_OVERVIEW_ID_BATCH = 500;

export async function loadAiOverviewShownPublicIds(
  tx: Prisma.TransactionClient,
  projectId: string,
  publicIds: readonly string[],
  asOf: Date,
) {
  const shown = new Set<string>();
  for (let index = 0; index < publicIds.length; index += AI_OVERVIEW_ID_BATCH) {
    const batch = publicIds.slice(index, index + AI_OVERVIEW_ID_BATCH);
    if (!batch.length) continue;
    const rows = await tx.$queryRaw<Array<{ keywordId: string }>>(
      aiOverviewShownIdsSql(projectId, batch, asOf),
    );
    for (const row of rows) if (row.keywordId) shown.add(row.keywordId);
  }
  return shown;
}

export async function loadAiOverviewPageFacts(
  tx: Prisma.TransactionClient,
  projectId: string,
  projectDomain: string | null,
  publicIds: readonly string[],
  asOf: Date,
): Promise<RankTrackerAiOverviewFact[]> {
  const domain = trackedProjectDomain(projectDomain);
  const facts: RankTrackerAiOverviewFact[] = [];
  for (let index = 0; index < publicIds.length; index += AI_OVERVIEW_ID_BATCH) {
    const batch = publicIds.slice(index, index + AI_OVERVIEW_ID_BATCH);
    if (!batch.length) continue;
    const rows = await tx.$queryRaw<AiOverviewItemRow[]>(
      aiOverviewPageItemsSql(projectId, batch, asOf),
    );
    facts.push(...aiOverviewFactsFromRows(rows, domain));
  }
  return facts;
}
