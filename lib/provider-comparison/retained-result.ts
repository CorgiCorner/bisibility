import type { SerpRankResult } from "@/lib/providers/types";
import { redactProviderResponse } from "./provider-response";
import type { ComparisonResult } from "./types";

export type RetainedComparisonResult = ComparisonResult & {
  _capture?: {
    checkedAt: string;
    raw: SerpRankResult["raw"];
    observation: SerpRankResult["observation"];
  };
  _providerResponse?: unknown;
  _sourceCheckId?: string;
  _savedCheckRef?: string;
};
/** Only the normalized public projection leaves the server. Native fragments stay in storage. */
export function publicComparisonResult(value: unknown): ComparisonResult | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const fields = [
    "features",
    "observedAt",
    "recordedAt",
    "position",
    "rankingUrl",
    "results",
    "configuredScope",
    "effectiveScope",
    "completeness",
    "normalizationVersion",
    "evidence",
    "completeThrough",
  ];
  return Object.fromEntries(
    fields.filter((key) => key in record).map((key) => [key, record[key]]),
  ) as ComparisonResult;
}
export function retainComparisonCapture(
  result: ComparisonResult,
  response: SerpRankResult,
): RetainedComparisonResult {
  return {
    ...result,
    ...(response.raw?.provider_response === undefined && response.providerResponse !== undefined
      ? { _providerResponse: redactProviderResponse(response.providerResponse) }
      : {}),
    _capture: {
      checkedAt: response.checkedAt.toISOString(),
      raw:
        response.raw?.provider_response === undefined
          ? response.raw
          : {
              ...response.raw,
              provider_response: redactProviderResponse(response.raw.provider_response),
            },
      observation: response.observation,
    },
  };
}
