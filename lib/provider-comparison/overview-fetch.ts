import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { UrlRepairTarget } from "@/lib/serp-url-repair/model";
import { assertComparisonAccess } from "./access";
import { parseComparisonSnapshot } from "./model";
import { playgroundSearchKey } from "./playground-history-group";
import { fetchedOverviewWhere } from "./playground-history-search";
import { previewPlaygroundComparison } from "./playground-service";
import { comparisonRunView } from "./read";

type OverviewInput = { projectId: string; actorId: string; target: UrlRepairTarget };

/** The exact Google search behind a saved SerpApi source, rejected when its settings drifted. */
async function overviewSearch(tx: Prisma.TransactionClient, input: OverviewInput) {
  if (input.target.kind === "comparison") {
    if (input.target.provider !== "serpapi") throw new Error("Overview provider unavailable.");
    const side = await tx.providerComparisonSide.findFirst({
      where: {
        runId: input.target.runId,
        projectId: input.projectId,
        provider: "serpapi",
        status: "completed",
      },
      include: { run: true },
    });
    if (!side) throw new Error("Saved source unavailable.");
    const snapshot = parseComparisonSnapshot(side.run.snapshot);
    return { query: snapshot.text, device: snapshot.device, locationId: snapshot.locationId };
  }
  const check = await tx.rankCheck.findFirst({
    where: {
      publicId: input.target.checkId,
      provider: "serpapi",
      keyword: { projectId: input.projectId, archivedAt: null },
    },
    include: { keyword: { include: { locationRef: true } } },
  });
  if (!check) throw new Error("Saved source unavailable.");
  const raw = check.raw as {
    snapshotContinuation?: {
      keyword?: string;
      device?: string;
      location?: { hl?: string; primaryGeoName?: string };
    };
  } | null;
  const captured = raw?.snapshotContinuation;
  const keyword = check.keyword;
  if (
    !captured ||
    captured.keyword !== keyword.text ||
    captured.device !== keyword.device ||
    captured.location?.hl !== keyword.locationRef.hl ||
    captured.location?.primaryGeoName !== keyword.locationRef.primaryGeoName
  )
    throw new Error("Search settings changed since the saved response.");
  return { query: keyword.text, device: keyword.device, locationId: keyword.locationId };
}

export async function previewOverviewFetch(input: OverviewInput) {
  const search = await prisma.$transaction(async (tx) => {
    await assertComparisonAccess(tx, input.projectId, input.actorId, true);
    return overviewSearch(tx, input);
  });
  return previewPlaygroundComparison({
    projectId: input.projectId,
    actorId: input.actorId,
    search: { ...search, aiOverview: true, depth: 10, providers: ["serpapi"] },
  });
}

/**
 * The newest completed overview fetch for the same search, so a fetched
 * overview is shown again instead of being offered as another paid request.
 */
export async function readSavedOverviewFetch(input: OverviewInput) {
  return prisma.$transaction(async (tx) => {
    await assertComparisonAccess(tx, input.projectId, input.actorId, false);
    const search = await overviewSearch(tx, input);
    const rows = await tx.providerComparisonRun.findMany({
      where: fetchedOverviewWhere(input.projectId, [{ ...search, text: search.query }]),
      include: { sides: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    for (const row of rows) {
      let snapshot: ReturnType<typeof parseComparisonSnapshot>;
      try {
        snapshot = parseComparisonSnapshot(row.snapshot);
      } catch {
        continue;
      }
      if (
        snapshot.aiOverview !== true ||
        playgroundSearchKey(snapshot) !== playgroundSearchKey({ ...search, text: search.query })
      )
        continue;
      const side = row.sides.find((item) => item.provider === "serpapi");
      if (side?.status === "completed" && side.result) return comparisonRunView(row);
    }
    return null;
  });
}
