"use client";

import { EmptyState } from "@/components/ui/EmptyState";
import { ArchiveIcon as Archive } from "@phosphor-icons/react/dist/ssr/Archive";
import { useTranslations } from "next-intl";

export type StoredResearchModule = "backlinks" | "domainOverview" | "keywordResearch";

export function StoredResearchEmpty({ module }: Readonly<{ module: StoredResearchModule }>) {
  const t = useTranslations("projectResearch.demo");
  return (
    <EmptyState
      description={t("noSavedResultsDescription")}
      icon={<Archive aria-hidden size={28} weight="regular" />}
      title={t("noSavedResults", { module: t(module) })}
    />
  );
}
