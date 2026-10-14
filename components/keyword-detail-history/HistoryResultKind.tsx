"use client";

import { useTranslations } from "next-intl";

/** Presentation aliases only; captured result kinds and comparison scopes stay unchanged. */
export function historyResultKindMessage(kind: string) {
  switch (kind) {
    case "organic_result":
    case "organic":
      return "resultKinds.organic_result";
    case "local_pack":
      return "resultKinds.local_pack";
    case "ai_overview":
      return "resultKinds.ai_overview";
    case "map_listing":
      return "resultKinds.map_listing";
    case "listing":
      return "resultKinds.listing";
    default:
      return null;
  }
}

export function HistoryResultKind({ kind }: Readonly<{ kind: string }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const key = historyResultKindMessage(kind);
  return (
    <>{key ? t(key) : kind.length === 0 ? t("unknown") : t("otherResultKind", { value: kind })}</>
  );
}
