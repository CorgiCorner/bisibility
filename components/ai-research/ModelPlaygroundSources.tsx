"use client";

import { sourceTypeLabel } from "@/components/ai-tracking/source-copy";
import { StatusChip } from "@/components/ui/StatusChip";
import type { PlaygroundCitedDomain } from "@/lib/ai-research/model-playground-view";
import { useTranslations } from "next-intl";

export function ModelPlaygroundSources({
  sources,
}: Readonly<{ sources: readonly PlaygroundCitedDomain[] }>) {
  const t = useTranslations("projectAiResearch");
  const tracking = useTranslations("projectAiTracking");
  return (
    <div className="grid min-w-0 gap-3">
      <h2 className="m-0 text-ui-body font-medium">
        {t("modelPlayground.sourcesAll", { count: sources.length })}
      </h2>
      {sources.map((source) => (
        <div className="flex flex-wrap items-center gap-2" key={source.domain}>
          <span className="text-ui-body">{source.domain}</span>
          <StatusChip dot={false} label={sourceTypeLabel(source.type, tracking)} tone="neutral" />
          <span className="text-ui-caption text-fg-muted">{source.engines.join(", ")}</span>
        </div>
      ))}
    </div>
  );
}
