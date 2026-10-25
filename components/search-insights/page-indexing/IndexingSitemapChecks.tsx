"use client";

import type { SitemapSnapshotRow } from "@/lib/search-index/ui-model";
import { useTranslations } from "next-intl";
import { indexingColors } from "./history-presentation";

export function IndexingSitemapChecks({
  checks,
}: Readonly<{ checks: SitemapSnapshotRow["checks"] }>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const total = checks.indexed + checks.notIndexed + checks.failed + checks.notChecked;
  const segments = [
    { state: "indexed", count: checks.indexed },
    { state: "not_indexed", count: checks.notIndexed },
    { state: "inspection_failed", count: checks.failed },
    { state: "not_checked", count: checks.notChecked },
  ] as const;
  const label = t("checksBreakdown", { ...checks });
  return (
    <div className="w-full min-w-0" role="img" aria-label={label} title={label}>
      <div
        aria-hidden
        className="grid h-1.5 overflow-hidden rounded"
        style={{
          gridTemplateColumns: segments
            .filter((part) => part.count > 0)
            .map((part) => `${part.count}fr`)
            .join(" "),
        }}
      >
        {segments
          .filter((part) => part.count > 0)
          .map((part) => (
            <span key={part.state} style={{ background: indexingColors[part.state] }} />
          ))}
      </div>
      <span className="mt-1 block whitespace-normal text-ui-caption text-fg-muted">
        {t("checksIndexed", { indexed: checks.indexed, total })}
      </span>
    </div>
  );
}
