"use client";

import { DomainOverviewResults } from "@/components/domain-overview/DomainOverviewResults";
import type { StoredDomainOverviewResult } from "@/lib/domain-overview/stored";
import { StoredResearchEmpty } from "./StoredResearchEmpty";

export function StoredDomainOverviewView({
  result,
}: Readonly<{ result: StoredDomainOverviewResult | null }>) {
  if (!result) return <StoredResearchEmpty title="Domain Overview" />;
  const { history, keywords, pages, ...report } = result;
  return (
    <DomainOverviewResults
      history={history}
      historyError={false}
      historyLoading={false}
      projectRef=""
      readOnly
      report={report}
      storedFreshness={result}
      storedModules={{ keywords, pages }}
      tableError={null}
      tableFetchedCount={{
        keywords: keywords?.rows.length ?? 0,
        pages: pages?.rows.length ?? 0,
      }}
      tableHasMore={{ keywords: false, pages: false }}
      tableLoading={null}
    />
  );
}
