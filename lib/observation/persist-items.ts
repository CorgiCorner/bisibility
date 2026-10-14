import "server-only";

import { Prisma } from "@/lib/generated/prisma/client";
import type { ObservationItemInput } from "./types";

export async function persistObservationItems(
  tx: Prisma.TransactionClient,
  observationRunId: string,
  items: readonly ObservationItemInput[],
  retainRaw: boolean,
) {
  if (items.length === 0) return;
  await tx.observationItem.createMany({
    data: items.map((item, ordinal) => ({
      observationRunId,
      resultKind: item.resultKind,
      ordinal,
      rankScale: item.rankScale,
      promotion: item.promotion,
      sourcePage: item.sourcePage,
      sourceBlockId: item.sourceBlockId,
      sourceOrdinal: item.sourceOrdinal,
      observedAt: item.observedAt,
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
        !retainRaw || item.rawFragment == null
          ? Prisma.JsonNull
          : (item.rawFragment as Prisma.InputJsonValue),
    })),
  });
}
