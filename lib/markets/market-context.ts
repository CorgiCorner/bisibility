import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { asMarketRef, type MarketRef } from "@/lib/routing/app-path";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { decideMarketContext } from "./market-context-decision";
import type { MarketContextValue } from "./market-context-value";
import { archivedMarketDestination } from "./market-routes";

// One resolution per request, shared by the layout and anything that asks again.
const perRequestCache: typeof cache = typeof cache === "function" ? cache : (fn) => fn;

const marketSelect = {
  location: { select: { canonicalKey: true } },
  locationId: true,
  projectId: true,
  publicId: true,
  status: true,
} as const;

const loadProjectMarket = perRequestCache(async (marketRef: string) => {
  if (!isPublicIdOfType(marketRef, "pmkt")) {
    return null;
  }
  return prisma.projectMarket.findUnique({ select: marketSelect, where: { publicId: marketRef } });
});

export type ResolvedMarketContext = MarketContextValue & { locationKey: string; projectId: string };

/**
 * Resolves the `m/{market}` segment for one request. The URL alone decides the answer; no
 * cookie is read here, which is what keeps two people opening the same link on the same page.
 * Unknown, malformed and other-project ids all answer 404; only an archived market of THIS
 * project is redirected, because only then does telling the reader cost nothing.
 */
export async function requireMarketContext(
  projectParam: string,
  marketParam: string,
): Promise<ResolvedMarketContext> {
  const access = await resolveProjectAccess(projectParam);
  const row = await loadProjectMarket(marketParam);
  const decision = decideMarketContext(access.projectId, marketParam, row);
  if (decision.kind === "not-found" || !row) {
    notFound();
  }
  if (decision.kind === "archived") {
    permanentRedirect(archivedMarketDestination(access.publicId, decision.marketRef));
  }
  return {
    locationKey: row.location.canonicalKey,
    market: { locationId: row.locationId, ref: asMarketRef(decision.marketRef) },
    projectId: access.projectId,
    projectRef: access.publicId,
  };
}

/**
 * Turns a stored `last-market` cookie value into a market of this project, or null. Absent,
 * malformed, unknown, archived and other-project values are all null, which is why a stale
 * cookie written by middleware for a bad URL can never steer a later navigation.
 */
export async function resolveLastMarketRef(
  projectId: string,
  value: string | undefined,
): Promise<MarketRef | null> {
  if (!value) {
    return null;
  }
  const row = await loadProjectMarket(value);
  const decision = decideMarketContext(projectId, value, row);
  return decision.kind === "market" ? asMarketRef(decision.marketRef) : null;
}

/**
 * The legacy `?market=` lens carried either a ProjectMarket publicId or the Location foreign
 * key the dashboard uses, so both are accepted for the one-way migration to the segment.
 */
export async function resolveLegacyMarketRef(
  projectId: string,
  value: string | undefined,
): Promise<MarketRef | null> {
  if (!value) {
    return null;
  }
  const row = await prisma.projectMarket.findFirst({
    select: { publicId: true },
    where: {
      OR: [{ publicId: value }, { locationId: value }],
      projectId,
      status: { in: [ProjectMarketStatus.active, ProjectMarketStatus.paused] },
    },
  });
  return row ? asMarketRef(row.publicId) : null;
}
