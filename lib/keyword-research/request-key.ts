import { createHash } from "node:crypto";
import { researchScopeForLocation } from "@/lib/research/scope";
import type { KeywordResearchMode } from "./types";

export type CanonicalKeywordResearchRequest = {
  connectionPublicId: string | null;
  countryCode: string;
  includeClickstream: boolean;
  languageCode: string;
  mode: KeywordResearchMode;
  normalizedSeed: string;
  resultLimit: number;
  seed: string;
};

export function normalizeResearchKeyword(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function canonicalKeywordResearchRequest(input: {
  connectionPublicId?: string;
  countryCode: string;
  includeClickstream: boolean;
  languageCode: string;
  mode: KeywordResearchMode;
  resultLimit: number;
  seed: string;
}): CanonicalKeywordResearchRequest {
  const scope = researchScopeForLocation({
    countryCode: input.countryCode,
    languageCode: input.languageCode,
    languageLabel: input.languageCode,
  });
  const seed = input.seed.trim().replace(/\s+/g, " ");
  return {
    connectionPublicId: input.connectionPublicId?.trim() || null,
    countryCode: scope.countryCode,
    includeClickstream: input.includeClickstream,
    languageCode: scope.languageCode,
    mode: input.mode,
    normalizedSeed: normalizeResearchKeyword(seed),
    resultLimit: input.resultLimit,
    seed,
  };
}

export function keywordResearchRequestKey(request: CanonicalKeywordResearchRequest) {
  const identity = [
    request.connectionPublicId ?? "",
    request.normalizedSeed,
    request.countryCode,
    request.languageCode,
    request.mode,
    request.includeClickstream ? "1" : "0",
    String(request.resultLimit),
  ].join("\n");
  return createHash("sha256").update(identity).digest("hex");
}
