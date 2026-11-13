import type { ChartMarker } from "@/lib/annotations/marker-style";
import type { useTranslations } from "next-intl";

type ChartMarkerCopy = ReturnType<typeof useTranslations<"shared.chartMarkers">>;

/** Same key names as projectTimeline.annotations. Notes and Google names stay on `title`. */
function conversionSourceLabel(source: string | undefined, t: ChartMarkerCopy) {
  if (source === "ga4") return t("conversionSource.ga4");
  if (source === "plausible") return t("conversionSource.plausible");
  return t("conversionSource.none");
}

export function chartMarkerTitle(
  marker: Pick<ChartMarker, "added" | "from" | "generated" | "removed" | "title" | "to">,
  t: ChartMarkerCopy,
) {
  if (marker.generated === "sitemapTitle") {
    return t("sitemapTitle", { added: marker.added ?? 0, removed: marker.removed ?? 0 });
  }
  if (marker.generated === "primaryConversion") {
    return t("primaryConversion", {
      from: conversionSourceLabel(marker.from, t),
      to: conversionSourceLabel(marker.to, t),
    });
  }
  if (marker.generated === "contentFallback") return t("contentFallback");
  if (marker.generated === "deindexedTitle") return t("deindexedTitle");
  if (marker.generated === "deployFallback") return t("deployFallback");
  if (marker.generated === "noteFallback") return t("noteFallback");
  return marker.title;
}
