import "server-only";

import type { OpenedKeywordResearch } from "./opened-research";
import { findStoredKeywordResearch } from "./stored-read";
import type { KeywordResearchMode } from "./types";

export { readKeywordResearchHistory } from "@/lib/research-history/keyword-history";

const modes = new Set<KeywordResearchMode>(["auto", "ideas", "related", "suggestions"]);

function storedLimit(value: number): 100 | 300 | 500 {
  return value === 300 || value === 500 ? value : 100;
}

export async function openStoredKeywordResearch(input: {
  projectId: string;
  requestKey: string;
}): Promise<OpenedKeywordResearch | null> {
  const stored = await findStoredKeywordResearch(input);
  if (!stored || !modes.has(stored.mode as KeywordResearchMode)) return null;
  return {
    countryCode: stored.countryCode,
    fetchedAt: stored.fetchedAt,
    freshUntil: stored.freshUntil,
    includeClickstream: stored.includeClickstream,
    languageCode: stored.languageCode,
    mode: stored.mode as KeywordResearchMode,
    ...(stored.originalPayment ? { payment: stored.originalPayment } : {}),
    provider: stored.provider,
    requestKey: stored.requestKey,
    resultLimit: storedLimit(stored.resultLimit),
    rows: stored.rows,
    seed: stored.seed,
    sources: stored.sources,
  };
}
