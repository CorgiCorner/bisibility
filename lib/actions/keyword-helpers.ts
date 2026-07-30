import { parsePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { normalizeResearchKeyword } from "@/lib/keyword-research/context";
import { makePublicId, revalidateKeywordViews } from "./_shared";

export {
  createKeywordBatch,
  createKeywordBatchSet,
  type KeywordBatchRow,
  keywordTupleKey,
} from "./keyword-batch";

/** Revalidate every project view affected by a keyword mutation. */
export function revalidateKeywords(keywordId?: string | null) {
  revalidateKeywordViews(keywordId);
}

export function promotedSavedKeywordPairs(
  keywords: readonly { text: string }[],
  location: string,
): Array<{ location: string; normalizedText: string }> {
  return keywords.map((keyword) => ({
    location,
    normalizedText: normalizeResearchKeyword(keyword.text),
  }));
}

export async function consumeSavedKeywords(
  tx: Pick<Prisma.TransactionClient, "savedKeyword">,
  projectId: string,
  publicIds: readonly string[] | undefined,
  promotedPairs: readonly { location: string; normalizedText: string }[],
) {
  if (!publicIds?.length || promotedPairs.length === 0) return;
  await tx.savedKeyword.deleteMany({
    where: {
      OR: [...promotedPairs],
      projectId,
      publicId: { in: [...publicIds] },
    },
  });
}

type KeywordTagClient = Pick<Prisma.TransactionClient, "keywordTag" | "tag">;
export async function addTags(
  client: KeywordTagClient,
  projectId: string,
  keywordIds: string[],
  tags: string[],
) {
  if (tags.length === 0) {
    return;
  }

  await client.tag.createMany({
    data: tags.map((name) => ({ name, projectId, publicId: makePublicId("tag") })),
    skipDuplicates: true,
  });
  const tagRows = await client.tag.findMany({
    select: { id: true },
    where: { name: { in: tags }, projectId },
  });

  await client.keywordTag.createMany({
    data: keywordIds.flatMap((keywordId) => tagRows.map((tag) => ({ keywordId, tagId: tag.id }))),
    skipDuplicates: true,
  });
}

export function keywordIdsWhere(projectId: string, keywordIds: string[]) {
  if (keywordIds.some((keywordId) => parsePublicId(keywordId)?.prefix !== "kw")) {
    throw new Error("Keyword not found.");
  }

  return { projectId, publicId: { in: keywordIds } };
}
