"use client";

import { IndexingSitemaps } from "@/components/search-insights/page-indexing/IndexingSitemaps";
import { SearchInsightsRowsCard } from "@/components/search-insights/SearchInsightsRowsCard";
import type { IndexingData, ReadSitemapsAction } from "@/lib/search-index/ui-model";
import { useTranslations } from "next-intl";

export function SearchConsoleSitemapsTab({
  data,
  projectId,
  readSitemapsAction,
}: Readonly<{
  data: IndexingData | null;
  projectId: string;
  readSitemapsAction?: ReadSitemapsAction;
}>) {
  const t = useTranslations("projectSearchInsights.indexing");
  if (!data) {
    return (
      <SearchInsightsRowsCard
        caption={t("sitemapSnapshotCaption")}
        empty
        emptyReason={t("noConnection")}
        title={t("sitemaps")}
      />
    );
  }
  return (
    <IndexingSitemaps
      backgroundRun={data.backgroundRun}
      onRead={readSitemapsAction ? () => readSitemapsAction({ projectId }) : undefined}
      rows={data.sitemaps}
      snapshot={data.sitemapSnapshot}
    />
  );
}
