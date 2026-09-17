import type { FeedFacetAxis } from "@/lib/feeds/facets";
import type { useTranslations } from "next-intl";

export function alertFeedFacetLabels(t: ReturnType<typeof useTranslations<"projectAlerts.feed">>) {
  return {
    addFeedFilter: t("facetAddFeedFilter"),
    addFilter: t("facetAddFilter"),
    axis: (axis: FeedFacetAxis) => alertFeedFacetAxis(axis, t),
    noMoreFilters: t("facetNoMoreFilters"),
    remove: (axis: FeedFacetAxis, label: string) =>
      t("facetRemove", { axis: alertFeedFacetAxis(axis, t), label }),
  };
}

function alertFeedFacetAxis(
  axis: FeedFacetAxis,
  t: ReturnType<typeof useTranslations<"projectAlerts.feed">>,
) {
  switch (axis) {
    case "engine":
      return t("facetAxisEngine");
    case "language":
      return t("facetAxisLanguage");
    case "market":
      return t("facetAxisMarket");
    case "module":
      return t("facetAxisModule");
    case "severity":
      return t("facetAxisSeverity");
  }
}
