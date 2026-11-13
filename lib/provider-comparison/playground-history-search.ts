import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { HISTORY_SCAN_BOUND } from "@/lib/research-history/contract";
import { parseComparisonSnapshot } from "./model";
import { type PlaygroundSearch, playgroundSearchKey } from "./playground-history-group";
import { comparisonRunView } from "./read";
import type { ComparisonRun } from "./types";

/**
 * Searches have no aiOverview key. A negated JSON path matches no row without
 * the key and would hide every search; DbNull selects that absence instead.
 */
export const playgroundSearch = {
  snapshot: { path: ["aiOverview"], equals: Prisma.DbNull },
} satisfies Prisma.ProviderComparisonRunWhereInput;

function searchOf(snapshot: unknown): PlaygroundSearch | null {
  const value = snapshot as Partial<PlaygroundSearch> | null;
  return typeof value?.text === "string" &&
    typeof value.device === "string" &&
    typeof value.locationId === "string"
    ? { text: value.text, device: value.device, locationId: value.locationId }
    : null;
}

/** The same exact identity and completed provider side used to reopen a saved overview. */
export function fetchedOverviewWhere(projectId: string, snapshots: readonly unknown[]) {
  const searches = snapshots.flatMap((snapshot) => searchOf(snapshot) ?? []);
  return {
    projectId,
    keywordId: null,
    sides: { some: { provider: "serpapi", status: "completed" } },
    AND: [
      { snapshot: { path: ["aiOverview"], equals: true } },
      {
        OR: searches.map((search) => ({
          AND: (["text", "device", "locationId"] as const).map((field) => ({
            snapshot: { path: [field], equals: search[field] },
          })),
        })),
      },
    ],
  } satisfies Prisma.ProviderComparisonRunWhereInput;
}

/** Retained for the page action, even though the drawer loads its own metadata. */
export async function readRecentPlaygroundSearches(projectId: string): Promise<ComparisonRun[]> {
  const rows = await prisma.providerComparisonRun.findMany({
    where: { projectId, keywordId: null, AND: [playgroundSearch] },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { sides: true },
  });
  const runs = rows.flatMap((row) => {
    try {
      const snapshot = parseComparisonSnapshot(row.snapshot);
      return snapshot.version === 2 ? [{ snapshot, view: comparisonRunView(row) }] : [];
    } catch {
      return [];
    }
  });
  if (!runs.length) return [];
  const overviews = await prisma.providerComparisonRun.findMany({
    where: fetchedOverviewWhere(
      projectId,
      runs.map((run) => run.snapshot),
    ),
    select: { snapshot: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_SCAN_BOUND,
  });
  const fetched = new Set(
    overviews.flatMap((row) => searchOf(row.snapshot) ?? []).map(playgroundSearchKey),
  );
  return runs.map(({ snapshot, view }) =>
    fetched.has(playgroundSearchKey(snapshot)) ? { ...view, overviewFetched: true as const } : view,
  );
}
