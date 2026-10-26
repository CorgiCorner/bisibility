"use client";

import { Card } from "@/components/ui/Card";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  groupPercentages,
  type IndexingGroup,
  type IndexingReport,
} from "@/lib/search-index/ui-model";
import { useFormatter, useTranslations } from "next-intl";

const colors: Record<IndexingGroup, string> = {
  indexed: "var(--green)",
  not_indexed: "var(--yellow)",
  inspection_failed: "var(--fg-muted)",
  not_checked: "var(--bg-inset)",
};

export function IndexingSummary({ report }: Readonly<{ report: IndexingReport }>) {
  const t = useTranslations("projectSearchInsights.indexing");
  const format = useFormatter();
  const percentages = groupPercentages(report.groups.map((group) => group.total));
  const hasUrls = report.groups.some((group) => group.total > 0);

  return (
    <Card size="sm" className="@container flex min-w-0 flex-col gap-2">
      {hasUrls ? (
        <div
          className="grid h-2.5 w-full gap-0.5 overflow-hidden rounded-[4px]"
          style={{
            gridTemplateColumns: report.groups
              .filter((group) => group.total > 0)
              .map((group) => `${group.total}fr`)
              .join(" "),
          }}
        >
          {report.groups.map((group, index) =>
            group.total > 0 ? (
              <Tooltip
                key={group.group}
                tone="surface"
                content={`${t(`groups.${group.group}`)}: ${format.number(group.total)} (${percentages[index]})`}
                wrapperClassName="min-w-0"
              >
                <span className="block h-full w-full" style={{ background: colors[group.group] }} />
              </Tooltip>
            ) : null,
          )}
        </div>
      ) : null}
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 @min-[640px]:grid-cols-4">
        {report.groups.map((group, index) => (
          <div key={group.group} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-ui-micro uppercase tracking-wide text-fg-muted">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: colors[group.group] }}
              />
              {t(`groups.${group.group}`)}
            </dt>
            <dd className="m-0 flex flex-wrap items-baseline gap-x-2 tabular-nums">
              <span className="text-ui-h2 font-semibold">{format.number(group.total)}</span>
              {hasUrls ? (
                <>
                  {" "}
                  <span className="text-ui-caption text-fg-muted">{percentages[index]}</span>
                </>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
