import "server-only";
import { referenceSchema } from "@/lib/business-locations/schema";
import type {
  BusinessObservationChoice,
  BusinessReviewContext,
  MatchSummary,
} from "@/lib/business-locations/ui-contracts";
import { locationSummary, matchSummary } from "@/lib/business-locations/ui-projection";
import { prisma } from "@/lib/db/prisma";
import { businessProjectScope } from "./access";
import type { BusinessDatabase, BusinessStoreContext } from "./context";
import { BusinessLocationUnavailableError, BusinessObservationUnavailableError } from "./errors";
import { loadBusinessLocation } from "./location-repository";
import { storedMatch } from "./match-repository";
import {
  projectRetainedBusinessObservation,
  retainedBusinessObservationSelect,
} from "./observation-read";
import { businessReviewSourceHash, reviewWatermark, selectBusinessReviewPage } from "./review-page";

export async function readBusinessObservationChoices(
  projectId: string,
  after: unknown,
  context: BusinessStoreContext,
  db: BusinessDatabase = prisma,
) {
  const cursor = after === null ? null : referenceSchema.parse(after);
  return db.$transaction(async (tx) => {
    const scope = await businessProjectScope(tx, context, projectId, "read", "entity_match");
    const rows = await tx.observationRun.findMany({
      where: {
        projectId: scope.project.id,
        surface: { in: ["web_serp", "maps", "local_finder"] },
        items: { some: { resultKind: { in: ["local_pack", "map_listing", "listing"] } } },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      take: 51,
      orderBy: { id: "asc" },
      select: {
        id: true,
        surface: true,
        createdAt: true,
        rankCheck: { select: { keyword: { select: { text: true } } } },
      },
    });
    const choices: BusinessObservationChoice[] = rows.slice(0, 50).map((row) => ({
      id: row.id,
      surface: row.surface as BusinessObservationChoice["surface"],
      keyword: row.rankCheck?.keyword.text ?? null,
      recordedAt: row.createdAt.toISOString(),
    }));
    return { choices, next: rows.length > 50 ? rows[49].id : null };
  });
}

/** A bounded, explicit rematch batch. Quality is never fabricated for missing retained proof. */
export async function readBusinessReviewContext(
  projectId: string,
  locationId: string,
  runId: string,
  context: BusinessStoreContext,
  db: BusinessDatabase = prisma,
  selection: unknown = {},
): Promise<BusinessReviewContext> {
  referenceSchema.parse(runId);
  return db.$transaction(
    async (tx) => {
      const scope = await businessProjectScope(tx, context, projectId, "read", "entity_match");
      const pageState = reviewWatermark(selection, new Date());
      const { location, row } = await loadBusinessLocation(tx, scope.project.id, locationId);
      const run = await tx.observationRun.findFirst({
        where: {
          projectId: scope.project.id,
          id: runId,
          createdAt: { lte: new Date(pageState.watermark) },
        },
        select: retainedBusinessObservationSelect,
      });
      if (!run || !["web_serp", "maps", "local_finder"].includes(run.surface))
        throw new BusinessLocationUnavailableError();
      let evidenceAvailable = true;
      try {
        projectRetainedBusinessObservation(run);
      } catch (error) {
        if (error instanceof BusinessObservationUnavailableError) evidenceAvailable = false;
        else throw error;
      }
      const page = selectBusinessReviewPage(
        run.items,
        {
          projectId,
          locationId,
          runId,
          identityRevisionId: location.currentRevision.id,
          sourceHash: businessReviewSourceHash(run),
        },
        pageState,
      );
      const selected = page.selected;
      const stored = await tx.businessMatchDecision.findMany({
        where: {
          projectId: scope.project.id,
          entityId: row.id,
          observationRunId: run.id,
          itemId: { in: selected.map((item) => item.id) },
          recordedAt: { lte: new Date(page.watermark) },
        },
        orderBy: [{ itemId: "asc" }, { decisionRevision: "desc" }],
      });
      const latest = new Map<string, (typeof stored)[number]>();
      for (const decision of stored)
        if (!latest.has(decision.itemId)) latest.set(decision.itemId, decision);
      const identity = locationSummary(location);
      const decisions: MatchSummary[] = selected.flatMap((item) => {
        const decision = latest.get(item.id);
        return decision
          ? [
              matchSummary(
                storedMatch(decision),
                row.publicId,
                run.surface as MatchSummary["surface"],
                {
                  locationName: identity.identity.name,
                  locationAddress: identity.identity.address,
                  itemName: item.businessName,
                  itemDomain: item.domain,
                },
              ),
            ]
          : [];
      });
      return {
        observationRunId: run.id,
        identityRevisionId: identity.identity.revisionId,
        decisions,
        expectedDecisions: selected.map((item) => ({
          itemId: item.id,
          expectedRevision: latest.get(item.id)?.decisionRevision ?? 0,
        })),
        evidenceAvailable,
        includedCount: selected.length,
        eligibleTotal: run.items.length,
        watermark: page.watermark,
        cursor: page.cursor,
        nextCursor: page.nextCursor,
        previousCursor: page.previousCursor,
        offset: page.offset,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
