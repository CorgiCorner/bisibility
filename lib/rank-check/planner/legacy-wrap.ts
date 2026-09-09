import "server-only";

import { createHash } from "node:crypto";
import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  providerAllocationReservation,
  reserveProviderAllocation,
} from "@/lib/rank-check/runs/launch-preflight";
import type { SerpDepth } from "@/lib/serp/constants";

export async function wrapLegacyRankCheck(
  tx: Prisma.TransactionClient,
  input: { keywordId: string },
  rankCheckId: string,
  reservation: {
    allocationConnection: { id: string; provider: string } | null;
    depth: SerpDepth;
    estimatedCostCents: number | null;
    keywordPublicId: string;
    projectId: string;
    providerAllocationsInitializedAt: boolean;
  },
  startedAt: Date,
) {
  const allocationReservation =
    reservation.providerAllocationsInitializedAt && reservation.allocationConnection?.id
      ? providerAllocationReservation(
          reservation.allocationConnection.id,
          pagesPerCheck(reservation.depth),
        )
      : {};
  if (reservation.providerAllocationsInitializedAt && reservation.allocationConnection) {
    await reserveProviderAllocation(tx, {
      connection: reservation.allocationConnection,
      estimatedCostCents: reservation.estimatedCostCents ?? 0,
      estimatedUsageQuantity: pagesPerCheck(reservation.depth),
      now: startedAt,
      projectId: reservation.projectId,
    });
  }
  const item = {
    estimatedCostCents:
      reservation.estimatedCostCents === null ? null : Math.ceil(reservation.estimatedCostCents),
    keywordId: input.keywordId,
    rankCheckId,
    startedAt,
    status: "running" as const,
  };
  const run = await tx.rankCheckRun.create({
    data: {
      estimatedCostCents: Math.ceil(reservation.estimatedCostCents ?? 0),
      items: { create: item },
      keywordCount: 1,
      projectId: reservation.projectId,
      publicId: makePublicId("rcr"),
      requestedCount: 1,
      selectionHash: createHash("sha256").update(input.keywordId).digest("hex"),
      selectionKind: "legacy_schedule",
      selectionSpec: {
        kind: "legacy_schedule",
        keywordId: reservation.keywordPublicId,
        v: 1,
        ...allocationReservation,
      },
      startedAt,
      status: "running",
      targetCount: 1,
      totalCount: 1,
      trigger: "scheduled",
    },
    select: { id: true },
  });
  await tx.rankCheck.update({ data: { runId: run.id }, where: { id: rankCheckId } });
}
