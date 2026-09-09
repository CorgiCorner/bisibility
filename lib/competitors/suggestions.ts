import "server-only";

import { prisma } from "@/lib/db/prisma";
import { normalizeDomain } from "@/lib/domains/normalize";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { CompetitorSuggestionEvidence } from "@/lib/getting-started/setup-steps";
import { activeMarketLocationIds, runnableKeywordWhere } from "@/lib/rank-check/runnable";
import { competitorSuggestionEvidence } from "./suggestion-evidence";

type CompetitorSuggestionsClient = Pick<
  Prisma.TransactionClient,
  "competitor" | "competitorSuggestionDismissal" | "keyword" | "project" | "projectMarket"
>;

function normalizedDomains(rows: Array<{ domain: string }>) {
  return new Set(rows.flatMap((row) => normalizeDomain(row.domain) ?? []));
}

/** Derives current, write-safe suggestion evidence from completed runnable keyword checks. */
export async function getCompetitorSuggestions(
  projectId: string,
  client: CompetitorSuggestionsClient = prisma,
): Promise<CompetitorSuggestionEvidence[]> {
  const [project, competitors, dismissals, activeLocationIds] = await Promise.all([
    client.project.findUnique({ select: { domain: true }, where: { id: projectId } }),
    client.competitor.findMany({ select: { domain: true }, where: { projectId } }),
    client.competitorSuggestionDismissal.findMany({
      select: { domain: true },
      where: { projectId },
    }),
    activeMarketLocationIds(projectId, client),
  ]);
  const projectDomain = project?.domain ? normalizeDomain(project.domain) : null;
  if (!projectDomain) return [];

  const excludedDomains = new Set([
    ...normalizedDomains(competitors),
    ...normalizedDomains(dismissals),
  ]);
  const keywords = await client.keyword.findMany({
    select: {
      text: true,
      rankChecks: {
        orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { organicRanks: true, raw: true },
        where: { status: "completed" },
      },
    },
    where: { projectId, ...runnableKeywordWhere(activeLocationIds) },
  });

  return competitorSuggestionEvidence(projectDomain, keywords, excludedDomains);
}
