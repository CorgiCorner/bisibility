import { parsePublicId } from "@/lib/db/public-id";

/** Keep identity validation independent of actions and schedule mutations. */
export function keywordIdsWhere(projectId: string, keywordIds: string[]) {
  if (keywordIds.some((keywordId) => parsePublicId(keywordId)?.prefix !== "kw")) {
    throw new Error("Keyword not found.");
  }
  return { projectId, publicId: { in: keywordIds } };
}
