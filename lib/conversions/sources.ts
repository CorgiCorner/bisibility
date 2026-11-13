import { PROVIDER_CATALOG } from "@/lib/providers/catalog-metadata";
import { type ConversionSource, isConversionSource } from "./types";

export type ConversionCatalogSource = {
  label: string;
  logoDomain: string | null;
  source: ConversionSource;
};

/** Analytics providers that collect conversions. Search Console is not one of them. */
export function conversionCatalogSources(): ConversionCatalogSource[] {
  return PROVIDER_CATALOG.flatMap((entry) => {
    if (entry.kind !== "analytics" || !isConversionSource(entry.id)) return [];
    return [{ label: entry.label, logoDomain: entry.logoDomain, source: entry.id }];
  });
}

export function conversionSourceLabel(source: ConversionSource) {
  return conversionCatalogSources().find((entry) => entry.source === source)?.label ?? source;
}
