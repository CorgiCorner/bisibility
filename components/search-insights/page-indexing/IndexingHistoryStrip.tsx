"use client";

import { projectDate } from "@/lib/presence/project-day";
import type { IndexingUrl } from "@/lib/search-index/ui-model";
import { useTranslations } from "next-intl";
import { historyStrip, indexingColors } from "./history-presentation";
import { useIndexingDate } from "./use-indexing-date";
import { useViewerTimeZone } from "./use-viewer-time-zone";

export function IndexingHistoryStrip({ detail }: Readonly<{ detail: IndexingUrl }>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const date = useIndexingDate();
  const timeZone = useViewerTimeZone();
  if (!detail.historyThrough) return null;
  const through = detail.historyAsOf
    ? projectDate(new Date(detail.historyAsOf), timeZone)
    : detail.historyThrough;
  const days = historyStrip(detail, through, timeZone);
  const start = date(days[0].date, true);
  const end = date(days[89].date, true);
  const states = ["indexed", "not_indexed", "not_checked"] as const;
  const summary = t("stripSummary", {
    start,
    end,
    indexed: days.filter((day) => day.state === "indexed").length,
    notIndexed: days.filter((day) => day.state === "not_indexed").length,
    notChecked: days.filter((day) => day.state === "not_checked").length,
  });
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="m-0 text-ui-caption font-semibold uppercase tracking-wide text-fg-muted">
        {t("last90Days")}
      </h3>
      <div
        role="img"
        aria-label={summary}
        className="grid h-4 min-w-0 gap-px"
        style={{ gridTemplateColumns: "repeat(90, minmax(0, 1fr))" }}
      >
        {days.map((day) => (
          <span
            aria-hidden
            key={day.date}
            title={`${date(day.date, true)}: ${t(`groups.${day.state}`)}`}
            className="rounded-sm"
            style={{ background: indexingColors[day.state] }}
          />
        ))}
      </div>
      <div className="flex justify-between text-ui-caption text-fg-muted">
        <span>{start}</span>
        <span>{end}</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-ui-caption text-fg">
        {states.map((state) => (
          <span key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-sm"
              style={{ background: indexingColors[state] }}
            />
            {t(`groups.${state}`)}
          </span>
        ))}
      </div>
    </section>
  );
}
