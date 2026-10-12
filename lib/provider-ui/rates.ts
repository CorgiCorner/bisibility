import { providerFeatureOverrideBasis } from "@/lib/cost-estimate/provider-feature-rates";
import {
  keywordMetricsRate,
  keywordResearchRate,
  rankedKeywordPageRate,
} from "@/lib/cost-estimate/provider-rates";
import {
  PROVIDER_RATE_LABELS,
  PROVIDER_RATE_UNITS,
  providerDomainOverviewListRates,
  providerListRate,
  providerRateFeatures,
} from "@/lib/provider-rates/catalog";
import type { ProviderRateFeature } from "@/lib/provider-rates/resolver";
import type { Figure, ProviderRate } from "@usagekit/views";
import { parseNativeRateCents } from "./form-schema";
import type { StoredUiConnection } from "./state";

export type NativeProviderRate = Omit<ProviderRate, "id"> & {
  id: ProviderRateFeature | ReturnType<typeof providerDomainOverviewListRates>[number]["feature"];
};

export const unknownFigure = (unit: string): Figure => ({ text: "", unit, certainty: "unknown" });
export const measuredFigure = (text: string, unit: string): Figure => ({
  text,
  unit,
  certainty: "measured",
});

/** The rate editor reads "/ check", so each price covers one quantity in the singular. */
const SINGULAR_UNITS: Readonly<Record<string, string>> = {
  calls: "call",
  checks: "check",
  keywords: "keyword",
  loads: "load",
};
const singular = (unit: string) => SINGULAR_UNITS[unit] ?? unit;

function nativeRateBasis(provider: string, feature: ProviderRateFeature) {
  const nativeRate =
    feature === "keyword_metrics"
      ? keywordMetricsRate(provider)
      : feature === "keyword_research"
        ? (keywordResearchRate(provider, "related") ??
          keywordResearchRate(provider, "suggestions") ??
          keywordResearchRate(provider, "ideas"))
        : feature === "ranked_keywords"
          ? rankedKeywordPageRate(provider)
          : null;
  const scalesByItem =
    nativeRate?.unitCostCents !== undefined &&
    providerFeatureOverrideBasis(nativeRate.feature) === "item";
  return {
    scalesByItem,
    // Native keyword coefficients are per item; sample call counts are a separate measure.
    unit: scalesByItem ? "keywords" : PROVIDER_RATE_UNITS[feature],
  };
}

/** Domain overview features have list prices only, so their rows stay read-only. */
function domainOverviewRates(connection: StoredUiConnection): NativeProviderRate[] {
  return providerDomainOverviewListRates(connection.provider).map((row) => {
    const price = parseNativeRateCents(row.amountCents.toFixed(4));
    return {
      id: row.feature,
      label: row.label,
      operation: row.feature,
      unit: singular(row.unit),
      priceUnit: "cents",
      price:
        price === null
          ? unknownFigure("cents")
          : { text: price, unit: "cents", certainty: "estimated" },
      fundingSource: connection.credentialSource === "hosted" ? "platform" : "byok",
      editable: false,
      provenance: {
        source: price === null ? "unknown" : "list",
        origin: price === null ? "unknown" : "catalog",
        checkedAt: row.checkedAt.toISOString(),
        sampleSize: null,
        version: null,
      },
    };
  });
}

type RateValue = Pick<ProviderRate, "price" | "provenance">;
const estimated = (text: string): Figure => ({ text, unit: "cents", certainty: "estimated" });
const unknownRate: RateValue = {
  price: unknownFigure("cents"),
  provenance: {
    source: "unknown",
    origin: "unknown",
    checkedAt: null,
    sampleSize: null,
    version: null,
  },
};

export function connectionRates(
  connection: StoredUiConnection,
  canManage: boolean,
): NativeProviderRate[] {
  const featureRates = providerRateFeatures(connection.provider).map(
    (feature): NativeProviderRate => {
      const override = connection.rates.find((row) => row.feature === feature);
      const manual = connection.credentialSource === "own" ? (override?.amountCents ?? null) : null;
      const list = providerListRate(connection.provider, feature);
      const listPrice = list ? parseNativeRateCents(String(list.amountCents)) : null;
      // A coefficient has no single automatic fallback: native quotes price whole variants.
      const automatic: RateValue =
        connection.credentialSource === "hosted" && list && listPrice !== null
          ? {
              price: estimated(listPrice),
              provenance: {
                source: "list",
                origin: "catalog",
                checkedAt: list.checkedAt.toISOString(),
                sampleSize: null,
                version: null,
              },
            }
          : unknownRate;
      const base = {
        id: feature,
        label: PROVIDER_RATE_LABELS[feature],
        operation: feature,
        unit: singular(nativeRateBasis(connection.provider, feature).unit),
        priceUnit: "cents",
        fundingSource: connection.credentialSource === "hosted" ? "platform" : "byok",
        editable: canManage && connection.credentialSource === "own",
      } as const;
      if (manual === null) return { ...base, ...automatic };
      const manualPrice = parseNativeRateCents(manual);
      return {
        ...base,
        price: manualPrice === null ? unknownFigure("cents") : estimated(manualPrice),
        provenance: {
          source: "manual",
          origin: "host",
          checkedAt: override?.updatedAt ?? connection.updatedAt.toISOString(),
          sampleSize: null,
          version: null,
        },
      };
    },
  );
  return connection.credentialSource === "own"
    ? featureRates
    : [...featureRates, ...domainOverviewRates(connection)];
}
