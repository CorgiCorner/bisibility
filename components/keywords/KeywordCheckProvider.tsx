"use client";

import { providerLabel } from "@/lib/checks/provider-label";
import { useTranslations } from "next-intl";

export function KeywordCheckProvider({ provider }: Readonly<{ provider?: string | null }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.header");
  const known = provider?.trim();
  return (
    <span>
      {known && known.toLowerCase() !== "unknown"
        ? t("provider", { provider: providerLabel(known) })
        : t("providerNotRecorded")}
    </span>
  );
}
