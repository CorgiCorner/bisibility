import { aiOverviewPresentation } from "./ai-overview-presentation";
import { type RichSerpFeature, richSerpFeatures } from "./serp-rich-features";

export type SerpFeaturePresentation = {
  richFeatures?: RichSerpFeature[];
  aiOverview: {
    present: boolean;
    paragraphs: string[];
    sources: { title: string; url: string }[];
    sections?: { heading?: string; text: string; markdown?: string }[];
  };
  localPack: {
    present: boolean;
    places: {
      name: string;
      position: number | null;
      url: string | null;
      description?: string;
      rating?: number;
      reviewCount?: number;
    }[];
  };
};
type Item = {
  resultKind: string;
  title?: string | null;
  businessName?: string | null;
  positionInBlock?: number | null;
  url?: string | null;
  mapsUrl?: string | null;
  rawFragment?: unknown;
};
const safeUrl = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};
/** Display only retained fields; a missing feature is not proof that Google omitted it. */
export function serpFeaturePresentation(
  items: readonly Item[],
  features: readonly string[] = [],
  providerResponse?: unknown,
): SerpFeaturePresentation {
  const ai = items.filter((item) => item.resultKind === "ai_overview");
  const local = items.filter((item) => item.resultKind === "local_pack");
  const normalized = features.map((value) => value.toLowerCase().replaceAll("_", " "));
  const richFeatures = richSerpFeatures(providerResponse, features);
  return {
    ...(richFeatures.length ? { richFeatures } : {}),
    aiOverview: {
      present: ai.length > 0 || normalized.includes("ai overview"),
      ...aiOverviewPresentation(ai),
    },
    localPack: {
      present:
        local.length > 0 ||
        normalized.some((value) =>
          ["local pack", "local results", "places results"].includes(value),
        ),
      places: local
        .slice(0, 30)
        .map((item) => ({
          name: (item.businessName ?? item.title ?? "").slice(0, 500),
          position: item.positionInBlock ?? null,
          url: safeUrl(item.mapsUrl ?? item.url),
          ...retainedPlaceDetails(item.rawFragment),
        }))
        .filter((item) => item.name),
    },
  };
}

function retainedPlaceDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const rating =
    raw.rating && typeof raw.rating === "object" ? (raw.rating as Record<string, unknown>) : null;
  return {
    ...(typeof raw.description === "string" && raw.description.trim()
      ? { description: raw.description.trim().slice(0, 2000) }
      : {}),
    ...(typeof rating?.value === "number" && Number.isFinite(rating.value)
      ? { rating: rating.value }
      : {}),
    ...(typeof rating?.votes_count === "number" && Number.isFinite(rating.votes_count)
      ? { reviewCount: rating.votes_count }
      : {}),
  };
}
