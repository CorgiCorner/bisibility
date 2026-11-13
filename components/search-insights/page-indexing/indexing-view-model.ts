import type { IndexingData, IndexingOverview } from "@/lib/search-index/ui-model";

export function indexingOverviewOf(data: IndexingData): IndexingOverview {
  if (data.overview) return data.overview;
  const group = data.report.groups.find((item) => item.group === "not_indexed");
  return {
    drops: [],
    reasons: {
      asOf: (data.now ?? new Date()).toISOString(),
      derived: false,
      rows: (group?.reasons ?? []).flatMap((reason) =>
        reason.coverageState && reason.coverageState !== "Unspecified"
          ? [{ change: null, count: reason.total, coverageState: reason.coverageState }]
          : [],
      ),
    },
    sources: { keyword_target: 0, manual: 0, sitemap: 0 },
  };
}
