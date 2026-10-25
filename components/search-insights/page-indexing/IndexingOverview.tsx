"use client";

import { PillBadge } from "@/components/ui/Pill";
import { Tooltip } from "@/components/ui/Tooltip";
import type { IndexingData, IndexingFilters } from "@/lib/search-index/ui-model";
import { FEEDBACK_URL } from "@/lib/site/site";
import { useTranslations } from "next-intl";
import { useId } from "react";
import { IndexingReasons } from "./IndexingReasons";
import { IndexingSummary } from "./IndexingSummary";
import { IndexingTrend } from "./IndexingTrend";

export function IndexingOverview({
  report,
  days,
  onSelect,
}: Readonly<
  Pick<IndexingData, "report" | "days"> & {
    onSelect: (value: IndexingFilters) => void;
  }
>) {
  const t = useTranslations("projectSearchInsights.indexing.overview");
  const headingId = useId();
  const reportUrl = new URL("https://search.google.com/search-console/index");
  reportUrl.searchParams.set("resource_id", report.property);
  const keepUrl = `${FEEDBACK_URL.split("?")[0]}?subject=${encodeURIComponent(t("keepSubject"))}`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3 rounded-card border border-border bg-bg-sunken p-3"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={headingId} className="m-0 text-ui-body-relaxed font-semibold">
            {t("title")}
          </h2>
          <Tooltip tone="surface" content={t("keepQuestion")} semantics="description">
            <a className="rounded-full" href={keepUrl}>
              <PillBadge size="xs" className="hover:text-fg">
                {t("badge")}
              </PillBadge>
            </a>
          </Tooltip>
        </div>
        <p className="m-0 text-ui-caption text-fg-muted">
          {t("note")}{" "}
          <a
            className="text-fg underline"
            href={reportUrl.toString()}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("openConsole")}
          </a>
        </p>
      </div>
      <IndexingSummary report={report} />
      <IndexingTrend days={days} complete={report.complete} />
      <IndexingReasons report={report} onSelect={onSelect} />
    </section>
  );
}
