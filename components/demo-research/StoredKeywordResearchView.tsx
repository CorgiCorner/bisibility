"use client";

import { ResearchResults } from "@/components/research/ResearchResults";
import type { StoredKeywordResearchResult } from "@/lib/keyword-research/stored-read";
import { StoredResearchEmpty } from "./StoredResearchEmpty";

export function StoredKeywordResearchView({
  result,
}: Readonly<{ result: StoredKeywordResearchResult | null }>) {
  if (!result) return <StoredResearchEmpty title="Keyword Research" />;
  return (
    <ResearchResults
      readOnly
      requestedLimit={result.resultLimit}
      result={result}
      seed={result.seed}
      storedFreshness={result}
    />
  );
}
