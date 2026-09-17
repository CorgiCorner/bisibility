import {
  type ChangeFilter,
  changeOptions,
  getFilterChips,
  type KeywordFilterChip,
  type KeywordFilters,
  type LastCheckFilter,
  lastCheckOptions,
  type PositionBucketId,
  positionBuckets,
  serpFeatures,
} from "@/lib/keywords/keyword-filter-model";
import type { useTranslations } from "next-intl";

type FilterTranslations = ReturnType<
  typeof useTranslations<"projectRankTracker.keywordImport.management.filters">
>;
type GridTranslations = ReturnType<
  typeof useTranslations<"projectRankTracker.keywordImport.management.grid">
>;
type FilterLabelKey =
  | "filterChangeAny"
  | "filterChangeDropped"
  | "filterChangeImproved"
  | "filterChangeLost"
  | "filterChangeNew"
  | "filterLastCheckAny"
  | "filterLastCheckCompleted"
  | "filterLastCheckFailed"
  | "filterLastCheckNotChecked"
  | "filterLastCheckRunning"
  | "filterPosition11To50"
  | "filterPosition51To100"
  | "filterPositionTop10"
  | "filterPositionTop3"
  | "filterSerpAiOverview"
  | "filterSerpFeatured"
  | "filterSerpImagePack"
  | "filterSerpPeopleAlsoAsk"
  | "filterSerpSitelinks"
  | "filterSerpVideo";
type FilterLabelTranslations = (key: FilterLabelKey) => string;

export type LocalizedKeywordFilterChip = KeywordFilterChip & { label: string };

function positionLabel(t: FilterLabelTranslations, position: PositionBucketId) {
  switch (position) {
    case "top3":
      return t("filterPositionTop3");
    case "top10":
      return t("filterPositionTop10");
    case "11-50":
      return t("filterPosition11To50");
    case "51-100":
      return t("filterPosition51To100");
  }
}

function changeLabel(t: FilterLabelTranslations, change: ChangeFilter) {
  switch (change) {
    case "any":
      return t("filterChangeAny");
    case "up":
      return t("filterChangeImproved");
    case "down":
      return t("filterChangeDropped");
    case "new":
      return t("filterChangeNew");
    case "lost":
      return t("filterChangeLost");
  }
}

function lastCheckLabel(t: FilterLabelTranslations, lastCheck: LastCheckFilter) {
  switch (lastCheck) {
    case "any":
      return t("filterLastCheckAny");
    case "failed":
      return t("filterLastCheckFailed");
    case "running":
      return t("filterLastCheckRunning");
    case "completed":
      return t("filterLastCheckCompleted");
    case "not_checked":
      return t("filterLastCheckNotChecked");
  }
}

function serpLabel(t: FilterLabelTranslations, feature: string) {
  switch (feature) {
    case "featured":
      return t("filterSerpFeatured");
    case "paa":
      return t("filterSerpPeopleAlsoAsk");
    case "sitelinks":
      return t("filterSerpSitelinks");
    case "image":
      return t("filterSerpImagePack");
    case "video":
      return t("filterSerpVideo");
    case "ai":
      return t("filterSerpAiOverview");
    default:
      return feature;
  }
}

export function localizedPositionBuckets(t: FilterTranslations) {
  return positionBuckets.map((bucket) => ({ id: bucket.id, label: positionLabel(t, bucket.id) }));
}

export function localizedChangeOptions(t: FilterTranslations) {
  return changeOptions.map((option) => ({ id: option.id, label: changeLabel(t, option.id) }));
}

export function localizedLastCheckOptions(t: FilterTranslations) {
  return lastCheckOptions.map((option) => ({ id: option.id, label: lastCheckLabel(t, option.id) }));
}

export function localizedSerpFeatures(t: FilterTranslations) {
  return serpFeatures.map((feature) => ({ id: feature.id, label: serpLabel(t, feature.id) }));
}

export function getLocalizedKeywordFilterChips(
  filters: KeywordFilters,
  t: GridTranslations,
): LocalizedKeywordFilterChip[] {
  return getFilterChips(filters).map((chip) => {
    if (chip.key === "position") {
      const positions = positionBuckets
        .filter((bucket) => filters.position.includes(bucket.id))
        .map((bucket) => positionLabel(t, bucket.id))
        .join(", ");
      return { ...chip, label: t("filterChipPosition", { positions }) };
    }
    if (chip.key === "change") {
      return { ...chip, label: t("filterChipChange", { change: changeLabel(t, filters.change) }) };
    }
    if (chip.key === "volume") {
      return {
        ...chip,
        label: t("filterChipVolume", {
          isCapped: filters.volMax >= 50 ? "yes" : "other",
          maximum: filters.volMax,
          minimum: filters.volMin,
        }),
      };
    }
    if (chip.key === "contains") {
      return { ...chip, label: t("filterChipContains", { value: filters.contains }) };
    }
    if (chip.key.startsWith("tag:")) {
      return { ...chip, label: t("filterChipTag", { value: chip.key.slice(4) }) };
    }
    if (chip.key.startsWith("topic:")) {
      return { ...chip, label: t("filterChipTopic", { value: chip.key.slice(6) }) };
    }
    if (chip.key.startsWith("intent:")) {
      return { ...chip, label: t("filterChipIntent", { value: chip.key.slice(7) }) };
    }
    if (chip.key.startsWith("serp:")) {
      return {
        ...chip,
        label: t("filterChipSerp", { feature: serpLabel(t, chip.key.slice(5)) }),
      };
    }
    if (chip.key === "lastCheck") {
      return {
        ...chip,
        label: t("filterChipLastCheck", { status: lastCheckLabel(t, filters.lastCheck) }),
      };
    }
    if (chip.key === "wrongUrl") {
      return { ...chip, label: t("filterChipWrongUrl") };
    }
    return { ...chip, label: t("filterChipUrlChanged") };
  });
}
