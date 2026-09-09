import "server-only";

import type { FirstCheckCandidate } from "@/lib/actions/rank-check-preview-result";
import { prisma } from "@/lib/db/prisma";

export async function firstCheckTargets(
  projectId: string,
  keywordText: string,
  limit: number,
): Promise<FirstCheckCandidate[]> {
  const rows = await prisma.keyword.findMany({
    where: { projectId, text: keywordText, archivedAt: null },
    orderBy: [{ targetUrl: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }],
    take: limit,
    select: {
      device: true,
      id: true,
      publicId: true,
      text: true,
      locationRef: { select: { displayName: true, languageLabel: true } },
      rankCheckRunItems: {
        where: { status: { in: ["queued", "running"] } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { run: { select: { publicId: true } } },
      },
      rankChecks: {
        where: { status: "completed" },
        orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          position: true,
          provider: true,
          rankingUrl: true,
          costCents: true,
          requestedDepth: true,
        },
      },
    },
  });
  return rows.map(({ locationRef, rankCheckRunItems, rankChecks, ...candidate }) => {
    const active = rankCheckRunItems[0];
    const completed = rankChecks[0];
    const previousResult: FirstCheckCandidate["previousResult"] = active
      ? { status: "queued", runId: active.run.publicId }
      : completed
        ? {
            status: "completed",
            position: completed.position,
            provider: completed.provider,
            rankingUrl: completed.rankingUrl,
            requestedDepth: completed.requestedDepth ?? undefined,
            recordedCostCents: completed.costCents === null ? null : Number(completed.costCents),
          }
        : undefined;
    return {
      ...candidate,
      market: { languageLabel: locationRef.languageLabel, locationLabel: locationRef.displayName },
      ...(previousResult ? { previousResult } : {}),
    };
  });
}
