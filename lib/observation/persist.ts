import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import type { ObservationRunInput } from "./types";

export async function persistObservationRun(
  tx: Prisma.TransactionClient,
  params: { rankCheckId: string; projectId: string; input: ObservationRunInput },
): Promise<void> {
  const observationRun = await tx.observationRun.create({
    data: {
      rankCheckId: params.rankCheckId,
      projectId: params.projectId,
      provider: params.input.provider,
      surface: params.input.surface,
      engine: params.input.engine,
      requestPolicy: params.input.requestPolicy as Prisma.InputJsonValue,
      completeness: params.input.completeness,
      configuredScope: params.input.configuredScope as Prisma.InputJsonValue,
      effectiveScope: params.input.effectiveScope ?? Prisma.DbNull,
      executedAt: params.input.executedAt,
    },
  });

  if (params.input.items.length === 0) return;

  await tx.observationItem.createMany({
    data: params.input.items.map((item, ordinal) => ({
      observationRunId: observationRun.id,
      resultKind: item.resultKind,
      ordinal,
      rankGroup: item.rankGroup,
      rankAbsolute: item.rankAbsolute,
      blockPosition: item.blockPosition,
      positionInBlock: item.positionInBlock,
      title: item.title,
      url: item.url,
      domain: item.domain,
      businessName: item.businessName,
      placeId: item.placeId,
      cid: item.cid,
      mapsUrl: item.mapsUrl,
      rating: item.rating ?? Prisma.DbNull,
      rawFragment:
        item.rawFragment == null ? Prisma.JsonNull : (item.rawFragment as Prisma.InputJsonValue),
    })),
  });
}

export async function persistRankCheckObservation(
  tx: Prisma.TransactionClient,
  input: ObservationRunInput | null | undefined,
  projectId: string,
  rankCheckId: string,
): Promise<void> {
  if (!input) return;
  await persistObservationRun(tx, { input, projectId, rankCheckId });
}
