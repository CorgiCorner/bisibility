"use client";

import type { SourceDisplayType } from "@/lib/ai-tracking/source-types";
import type { useTranslations } from "next-intl";

type Translate = ReturnType<typeof useTranslations<"projectAiTracking">>;

export function sourceTypeLabel(type: SourceDisplayType, t: Translate) {
  switch (type) {
    case "you":
      return t("sources.type.you");
    case "not_you":
      return t("sources.type.not_you");
    case "competitor":
      return t("sources.type.competitor");
    case "directory":
      return t("sources.type.directory");
    case "reviews":
      return t("sources.type.reviews");
    case "community":
      return t("sources.type.community");
    case "editorial":
      return t("sources.type.editorial");
    case "other":
      return t("sources.type.other");
    default:
      return t("sources.type.unsorted");
  }
}
