import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import type { HeaderContextMarket } from "@/lib/markets/header-context";
import { asMarketRef } from "@/lib/routing/app-path";
import { requireReadableProject } from "./_auth";

const visibleStatuses = [ProjectMarketStatus.active, ProjectMarketStatus.paused];

/**
 * The markets the header context slot offers, with what is tracked in each.
 *
 * It is deliberately not `getProjectMarkets`: that view exists for the markets PAGE and carries
 * a monthly cost estimate per market, which means a provider chain read and a rate-card
 * computation. The chrome renders on every page, so it reads the two things it actually shows -
 * the name-and-pair, and the keyword count - and nothing else.
 *
 * `paused` markets are offered too: a paused market is navigable, it just is not being checked,
 * which is the same rule the market route layer applies to the segment.
 */
export async function listHeaderMarkets(projectRef: string): Promise<HeaderContextMarket[]> {
  const { project } = await requireReadableProject(projectRef);
  const markets = await prisma.projectMarket.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      location: { select: { countryCode: true, displayName: true, languageCode: true } },
      locationId: true,
      publicId: true,
    },
    where: { projectId: project.id, status: { in: visibleStatuses } },
  });
  if (markets.length === 0) {
    return [];
  }

  const counts = await prisma.keyword.groupBy({
    _count: { _all: true },
    by: ["locationId"],
    where: {
      archivedAt: null,
      locationId: { in: markets.map((market) => market.locationId) },
      projectId: project.id,
    },
  });
  const countByLocation = new Map(counts.map((row) => [row.locationId, row._count._all]));

  return markets.map((market) => ({
    countryCode: market.location.countryCode,
    keywordCount: countByLocation.get(market.locationId) ?? 0,
    languageCode: market.location.languageCode,
    name: market.location.displayName,
    ref: asMarketRef(market.publicId),
  }));
}
