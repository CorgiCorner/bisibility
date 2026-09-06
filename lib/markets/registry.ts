import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { MarketArchivedError } from "./archived";
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

/** Archived markets, so a caller can offer an explicit restore. */
export function listArchivedProjectMarkets(
  projectId: string,
  client: ProjectMarketClient = prisma,
) {
  return client.projectMarket.findMany({
    include: { location: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    where: { projectId, status: ProjectMarketStatus.removed },
  });
}

/** One read for the write paths: the cap counts visible rows, the guard needs archived ones. */
function listProjectMarketsForWrite(projectId: string, client: ProjectMarketClient) {
  return client.projectMarket.findMany({
    include: { location: { select: { canonicalKey: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    where: { projectId },
  });
}

type RegistryRow = {
  location: { canonicalKey: string };
  locationId: string;
  status: ProjectMarketStatus;
};

function assertNoArchivedMarket(
  registry: readonly RegistryRow[],
  requested: readonly { locationId: string }[],
) {
  const requestedLocationIds = new Set(requested.map(({ locationId }) => locationId));
  const archived = registry.find(
    (market) =>
      market.status === ProjectMarketStatus.removed && requestedLocationIds.has(market.locationId),
  );
  if (archived) throw new MarketArchivedError(archived.location.canonicalKey);
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

type EnsureProjectMarketsOptions = {
  preserveVisibleStatus: boolean;
  refuseArchived: boolean;
};

/** Adds or revives a set without letting API/import writes bypass the registry cap. */
async function ensureProjectMarkets(
  projectId: string,
  locations: readonly { locationId: string }[],
  client: ProjectMarketClient,
  { preserveVisibleStatus, refuseArchived }: EnsureProjectMarketsOptions,
): Promise<AddProjectMarketsResult> {
  const unique = uniqueProjectMarketLocations(locations);
  const registry = await listProjectMarketsForWrite(projectId, client);
  if (refuseArchived) assertNoArchivedMarket(registry, unique);
  const visible = registry.filter((market) => market.status !== ProjectMarketStatus.removed);
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
  return ensureProjectMarkets(projectId, locations, client, {
    preserveVisibleStatus: false,
    refuseArchived: true,
  });
}

/** Reconciliation activates new or removed rows while retaining a visible paused status. */
export function reconcileProjectMarketsWithinLimit(
  projectId: string,
  locations: readonly { locationId: string }[],
  client: ProjectMarketClient = prisma,
) {
  return ensureProjectMarkets(projectId, locations, client, {
    preserveVisibleStatus: true,
    refuseArchived: true,
  });
}

/** Keyword writes create missing rows but never resume a paused or archived market. */
export function ensureKeywordProjectMarketsWithinLimit(
  projectId: string,
  locations: readonly { locationId: string }[],
  client: ProjectMarketClient = prisma,
) {
  return ensureProjectMarkets(projectId, locations, client, {
    preserveVisibleStatus: true,
    refuseArchived: true,
  });
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

/**
 * The only way back from removed; it never touches a keyword's own archive state.
 * The write is a compare-and-swap on the removed status, so a restore that lands after a
 * concurrent archive matches nothing instead of silently undoing it. Callers treat a zero
 * count as the refusal.
 */
export function restoreProjectMarket(
  { projectId, locationId }: ProjectMarketRef,
  client: ProjectMarketClient = prisma,
) {
  return client.projectMarket.updateMany({
    where: { locationId, projectId, status: ProjectMarketStatus.removed },
    data: { status: ProjectMarketStatus.active },
  });
}
