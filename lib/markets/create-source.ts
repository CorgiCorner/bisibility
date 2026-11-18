import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ProjectMarketStatus } from "@/lib/generated/prisma/client";
import { normalizeResearchKeyword } from "@/lib/keyword-research/context";
import {
  type MarketPasteRow,
  type NewMarketCreateInput,
  parseNewMarketPaste,
} from "./create-input";

export class MarketSourceError extends Error {
  readonly code = "market_source_invalid";

  constructor() {
    super("The source market is no longer available to copy.");
    this.name = "MarketSourceError";
  }
}

export async function termsForMarketCreate(
  tx: Pick<Prisma.TransactionClient, "projectMarket" | "keyword">,
  projectId: string,
  method: NewMarketCreateInput["method"],
) {
  if (method.kind === "empty") return [];
  if (method.kind === "paste") return parseNewMarketPaste(method.text);
  const source = await tx.projectMarket.findFirst({
    include: { location: { select: { canonicalKey: true } } },
    where: { projectId, publicId: method.sourceMarketId, status: ProjectMarketStatus.active },
  });
  if (!source) throw new MarketSourceError();
  const keywords = await tx.keyword.findMany({
    select: { text: true },
    where: { archivedAt: null, locationId: source.locationId, projectId },
  });
  const unique = new Map<string, MarketPasteRow>();
  for (const keyword of keywords)
    unique.set(normalizeResearchKeyword(keyword.text), { targetUrl: null, text: keyword.text });
  return [...unique.values()];
}
