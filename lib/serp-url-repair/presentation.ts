import type { SerpFeaturePresentation } from "@/lib/checks/serp-feature-presentation";
import { repairedUrl } from "./model";

export function featureUrls(features: SerpFeaturePresentation | null | undefined): string[] {
  if (!features) return [];
  return [
    ...features.aiOverview.sources.map((item) => item.url),
    ...features.localPack.places.flatMap((item) => (item.url ? [item.url] : [])),
    ...(features.richFeatures ?? []).flatMap((feature) =>
      feature.items.flatMap((item) => (item.url ? [item.url] : [])),
    ),
  ];
}
export function repairedFeatures(
  features: SerpFeaturePresentation,
  repair: unknown,
): SerpFeaturePresentation {
  return {
    ...features,
    aiOverview: {
      ...features.aiOverview,
      sources: features.aiOverview.sources.map((item) => ({
        ...item,
        url: repairedUrl(item.url, repair),
      })),
    },
    localPack: {
      ...features.localPack,
      places: features.localPack.places.map((item) => ({
        ...item,
        url: item.url ? repairedUrl(item.url, repair) : null,
      })),
    },
    ...(features.richFeatures
      ? {
          richFeatures: features.richFeatures.map((feature) => ({
            ...feature,
            items: feature.items.map((item) => ({
              ...item,
              ...(item.url ? { url: repairedUrl(item.url, repair) } : {}),
            })),
          })),
        }
      : {}),
  };
}
