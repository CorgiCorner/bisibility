"use client";

import { StatTile } from "@/components/ui/StatTile";
import { defaultProjectPagesQuery, projectPagesHref } from "@/lib/pages/url-state";
import { indexedShare, inspectionFailuresRetryNextDay } from "@/lib/search-index/progress-model";
import type { IndexingData, IndexingGroup } from "@/lib/search-index/ui-model";
import { useFormatter, useTranslations } from "next-intl";
import { indexingOverviewOf } from "./indexing-view-model";

const groups = ["indexed", "not_indexed", "inspection_failed", "not_checked"] as const;

export function IndexingGroupTiles({
  data,
  projectId,
}: Readonly<{ data: IndexingData; projectId: string }>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const overview = indexingOverviewOf(data);
  const retry = inspectionFailuresRetryNextDay(
    data.settings.budgetMode,
    data.settings.inspectionDailyLimit,
  );
  const href = (group: IndexingGroup) =>
    projectPagesHref(projectId, { ...defaultProjectPagesQuery, index: group });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {groups.map((group) => {
        const count = data.report.groups.find((item) => item.group === group)?.total ?? 0;
        const share = group === "indexed" ? indexedShare(count, data.report.checked) : null;
        const detail =
          group === "indexed"
            ? share == null
              ? t("tiles.noChecked")
              : t("tiles.indexedShare", {
                  percent: format.number(share, { maximumFractionDigits: 0, style: "percent" }),
                })
            : group === "not_indexed"
              ? t("tiles.reasonCount", { count: overview.reasons.rows.length })
              : group === "inspection_failed"
                ? t(retry ? "tiles.retriedTomorrow" : "tiles.notScheduled")
                : t("tiles.queued");
        return (
          <StatTile
            caption={detail}
            density="compact"
            href={href(group)}
            key={group}
            label={t(`tiles.names.${group}`)}
            value={format.number(count)}
          />
        );
      })}
    </div>
  );
}
