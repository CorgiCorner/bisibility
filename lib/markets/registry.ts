import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import {
  type AddProjectMarketsResult,
  projectMarketAddResult,
  uniqueProjectMarketLocations,
} from "./project-market-add-result";

export type ProjectMarketRef = {
  projectId: string;
  locationId: string;
};

type ProjectMarketClient = Pick<typeof prisma, "projectMarket">;

const visibleProjectMarketStatuses = [ProjectMarketStatus.active, ProjectMarketStatus.paused];

/** Returns active and paused markets in their stable registry order. */
export function listProjectMarkets(projectId: string, client: ProjectMarketClient = prisma) {
  return client.projectMarket.findMany({
    where: {
      projectId,
      status: { in: visibleProjectMarketStatuses },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

/** Creates a market once or restores the existing market to active. */
export function ensureActiveProjectMarket(
  { projectId, locationId }: ProjectMarketRef,
  client: ProjectMarketClient = prisma,
) {
  return client.projectMarket.upsert({
    where: { projectId_locationId: { projectId, locationId } },
    create: {
      publicId: makePublicId("pmkt"),
      projectId,
      locationId,
      status: ProjectMarketStatus.active,
    },
    update: { status: ProjectMarketStatus.active },
  });
}

/** Adds or revives a set without letting API/import writes bypass the registry cap. */
async function ensureProjectMarkets(
  projectId: string,
  locations: readonly { locationId: string }[],
  client: ProjectMarketClient,
  preserveVisibleStatus: boolean,
): Promise<AddProjectMarketsResult> {
  const unique = uniqueProjectMarketLocations(locations);
  const visible = await listProjectMarkets(projectId, client);
  const outcome = projectMarketAddResult(
    visible.map((market) => market.locationId),
    unique,
  );
  if (!outcome.ok) return outcome;
  const visibleByLocation = new Map(visible.map((market) => [market.locationId, market]));
  const locationsToActivate = preserveVisibleStatus
    ? unique.filter(({ locationId }) => !visibleByLocation.has(locationId))
    : unique;
  const stored = await Promise.all(
    locationsToActivate.map(({ locationId }) =>
      ensureActiveProjectMarket({ locationId, projectId }, client),
    ),
  );
  const storedByLocation = new Map(
    locationsToActivate.map(({ locationId }, index) => [locationId, stored[index]]),
  );
  return {
    ...outcome,
    marketIds: unique.flatMap(({ locationId }) => {
      const publicId =
        storedByLocation.get(locationId)?.publicId ?? visibleByLocation.get(locationId)?.publicId;
      return publicId ? [publicId] : [];
    }),
  };
}

export function ensureProjectMarketsWithinLimit(
  projectId: string,
  locations: readonly { locationId: string }[],
  client: ProjectMarketClient = prisma,
) {
  return ensureProjectMarkets(projectId, locations, client, false);
}

/** Reconciliation activates new or removed rows while retaining a visible paused status. */
export function reconcileProjectMarketsWithinLimit(
  projectId: string,
  locations: readonly { locationId: string }[],
  client: ProjectMarketClient = prisma,
) {
  return ensureProjectMarkets(projectId, locations, client, true);
}

/** Keyword writes create missing registry rows but never resume a paused market. */
export function ensureKeywordProjectMarketsWithinLimit(
  projectId: string,
  locations: readonly { locationId: string }[],
  client: ProjectMarketClient = prisma,
) {
  return ensureProjectMarkets(projectId, locations, client, true);
}

export function pauseProjectMarket(
  { projectId, locationId }: ProjectMarketRef,
  client: ProjectMarketClient = prisma,
) {
  return client.projectMarket.update({
    where: { projectId_locationId: { projectId, locationId } },
    data: { status: ProjectMarketStatus.paused },
  });
}

/** Soft removal deliberately leaves keywords and their history untouched. */
export function removeProjectMarket(
  { projectId, locationId }: ProjectMarketRef,
  client: ProjectMarketClient = prisma,
) {
  return client.projectMarket.update({
    where: { projectId_locationId: { projectId, locationId } },
    data: { status: ProjectMarketStatus.removed },
  });
}
