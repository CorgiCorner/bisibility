import "server-only";

import { findKeywordMatches } from "@/lib/queries/keyword-matches";

/**
 * Which of these query texts the project already tracks in Rank Tracker.
 *
 * Precondition: the caller has already authorized the actor for this project. The lookup takes
 * the internal project id and performs no authorization of its own.
 *
 * The returned set holds the normalized form the database matched on, so a caller looks a row
 * up by `trackedKey(text)` rather than by its raw text.
 */
export async function getTrackedQueryTexts(
  projectId: string,
  texts: readonly string[],
): Promise<Set<string>> {
  if (texts.length === 0) return new Set();
  const { matches } = await findKeywordMatches(projectId, texts);
  return new Set(matches.map((match) => match.matchedText));
}
