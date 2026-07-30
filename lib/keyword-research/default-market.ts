import "server-only";

import { prisma } from "@/lib/db/prisma";
import { projectDefaultSerpMarket } from "@/lib/serp/default-market";
import type { KeywordResearchPageProject } from "./context";

const MARKET_GROUP_LIMIT = 16;

const locationSelect = {
  canonicalKey: true,
  cityName: true,
  countryCode: true,
  displayName: true,
  hl: true,
  id: true,
  kind: true,
  languageLabel: true,
} as const;

export async function keywordResearchDefaultMarket(project: KeywordResearchPageProject) {
  const explicit = projectDefaultSerpMarket(project.defaults, []);
  if (explicit.source === "explicit") {
    return { locationRef: project.defaults?.locationRef ?? null, market: explicit };
  }

  const groups = await prisma.keyword.groupBy({
    _count: { _all: true },
    by: ["locationId", "device"],
    orderBy: [{ _count: { id: "desc" } }, { locationId: "asc" }, { device: "asc" }],
    take: MARKET_GROUP_LIMIT,
    where: { projectId: project.id },
  });
  if (groups.length === 0) {
    return { locationRef: null, market: explicit };
  }

  const locations = await prisma.location.findMany({
    select: locationSelect,
    where: { id: { in: groups.map((group) => group.locationId) } },
  });
  const locationsById = new Map(locations.map((location) => [location.id, location]));
  const candidates = groups.flatMap((group) => {
    const locationRef = locationsById.get(group.locationId);
    if (!locationRef) return [];
    const row = { device: group.device, location: locationRef.displayName, locationRef };
    return [
      {
        count: group._count._all,
        locationRef,
        market: projectDefaultSerpMarket(null, [row]),
        row,
      },
    ];
  });
  const highestCount = Math.max(...candidates.map((candidate) => candidate.count), 0);
  const tied = candidates.filter((candidate) => candidate.count === highestCount);
  if (tied.length === 0) {
    return { locationRef: null, market: explicit };
  }

  const market = projectDefaultSerpMarket(
    null,
    tied.map((candidate) => candidate.row),
  );
  const selected = tied.find(
    (candidate) =>
      candidate.market.locationKey === market.locationKey &&
      candidate.market.device === market.device,
  );
  return { locationRef: selected?.locationRef ?? null, market };
}
