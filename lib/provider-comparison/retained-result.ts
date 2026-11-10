import { serpFeaturePresentation } from "@/lib/checks/serp-feature-presentation";
import type { SerpRankResult } from "@/lib/providers/types";
import type { UrlRepairState } from "@/lib/serp-url-repair/model";
import { repairedUrl, repairView } from "@/lib/serp-url-repair/model";
import { repairedFeatures } from "@/lib/serp-url-repair/presentation";
import { redactProviderResponse } from "./provider-response";
import type { ComparisonResult } from "./types";

export type RetainedComparisonResult = ComparisonResult & {
  _urlRepair?: UrlRepairState;
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
  const capture = (value as RetainedComparisonResult)._capture;
  const native =
    capture?.raw?.provider_response ?? (value as RetainedComparisonResult)._providerResponse;
  const projected = Object.fromEntries(
    fields.filter((key) => key in record).map((key) => [key, record[key]]),
  ) as ComparisonResult;
  if (native && projected.features)
    projected.features = {
      ...projected.features,
      richFeatures: serpFeaturePresentation([], capture?.raw?.serp_features, native).richFeatures,
    };
  if (Array.isArray(projected.results))
    projected.results = projected.results.map((row) => {
      const url = repairedUrl(row.url, record._urlRepair);
      return url === row.url ? row : { ...row, url, domain: new URL(url).hostname };
    });
  if (projected.features)
    projected.features = repairedFeatures(projected.features, record._urlRepair);
  const urlRepair = repairView(record._urlRepair);
  if (urlRepair) projected.urlRepair = urlRepair;
  return projected;
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
