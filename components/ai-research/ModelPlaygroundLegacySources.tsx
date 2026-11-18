"use client";

import { sourceTypeLabel } from "@/components/ai-tracking/source-copy";
import { StatusChip } from "@/components/ui/StatusChip";
import type { PlaygroundCitedDomain } from "@/lib/ai-research/model-playground-view";
import type { ResultColumn } from "@/lib/model-playground/result-view";
import { useTranslations } from "next-intl";

export function ModelPlaygroundLegacySources({
  columns,
  compact,
}: Readonly<{
  columns: readonly ResultColumn[];
  compact: boolean;
}>) {
  const t = useTranslations("projectAiResearch");
  const tracking = useTranslations("projectAiTracking");
  const grouped = new Map<string, PlaygroundCitedDomain>();
  for (const column of columns)
    for (const source of column.legacySources ?? []) {
      const previous = grouped.get(source.domain);
      grouped.set(source.domain, {
        ...source,
        count: source.count + (previous?.count ?? 0),
        engines: [...(previous?.engines ?? []), ...source.engines],
      });
    }
  const sources = [...grouped.values()].sort(
    (a, b) => b.count - a.count || a.domain.localeCompare(b.domain),
  );
  return (
    <div className="grid min-w-0 gap-2">
      <h3 className="m-0 text-ui-caption font-medium">
        {compact
          ? t("modelPlayground.sourcesHeading")
          : t("modelPlayground.sourcesAll", { count: sources.length })}
      </h3>
      {sources.map((source) => (
        <div className="flex flex-wrap items-center gap-2" key={source.domain}>
          <span className="text-ui-body">{source.domain}</span>
          {compact ? (
            <span className="text-ui-caption tabular-nums text-fg-muted">
              {t("modelPlayground.citedTimes", { count: source.count })}
            </span>
          ) : null}
          <StatusChip dot={false} label={sourceTypeLabel(source.type, tracking)} tone="neutral" />
          {!compact ? (
            <span className="text-ui-caption text-fg-muted">{source.engines.join(", ")}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
