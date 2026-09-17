"use client";

import { useTranslations } from "next-intl";
import { IntentChip } from "./research-results-model";

export function ResearchIntentChip({ intent }: Readonly<{ intent: string | null }>) {
  const t = useTranslations("projectResearch.filters");
  const label =
    intent === "commercial"
      ? t("commercial")
      : intent === "informational"
        ? t("informational")
        : intent === "navigational"
          ? t("navigational")
          : intent === "transactional"
            ? t("transactional")
            : null;
  return <IntentChip intent={intent} label={label} />;
}
