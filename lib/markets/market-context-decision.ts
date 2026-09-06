import { isPublicIdOfType } from "@/lib/db/public-id";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";

export type MarketRegistryRow = {
  projectId: string;
  publicId: string;
  status: ProjectMarketStatus;
};

export type MarketContextDecision =
  | { kind: "archived"; marketRef: string }
  | { kind: "market"; marketRef: string }
  | { kind: "not-found" };

/**
 * The whole authorization decision for a market segment, kept pure so both outcomes that
 * look identical in a browser can be tested: a market of ANOTHER project answers 404, never
 * a redirect, because a redirect would confirm that the id exists.
 *
 * `paused` is still a navigable market - it is visible in the registry, it just is not being
 * checked. Only `removed` is archived.
 */
export function decideMarketContext(
  projectId: string,
  requestedRef: string,
  row: MarketRegistryRow | null,
): MarketContextDecision {
  if (!isPublicIdOfType(requestedRef, "pmkt")) {
    return { kind: "not-found" };
  }
  if (!row || row.projectId !== projectId) {
    return { kind: "not-found" };
  }
  if (row.status === ProjectMarketStatus.removed) {
    return { kind: "archived", marketRef: row.publicId };
  }
  return { kind: "market", marketRef: row.publicId };
}
