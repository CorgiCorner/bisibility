"use client";
import { KeywordCheckScope } from "@/components/keywords/KeywordCheckScope";
import { PillBadge } from "@/components/ui/Pill";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type SearchScope, searchScopeKeyword, searchTimeFormat } from "./search-scope";
export function PlaygroundSearchRow({
  run,
}: {
  run: SearchScope & { createdAt: string; overviewFetched?: true };
}) {
  const locale = useLocale(),
    format = useFormatter();
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  return (
    <span className="grid min-w-0 flex-1 gap-2">
      <span className="block truncate text-sm font-medium">{run.keyword.text}</span>
      <span className="flex flex-wrap items-center gap-x-5 gap-y-2 font-normal">
        <KeywordCheckScope
          as="span"
          keyword={searchScopeKeyword(run, locale)}
          locationLabel={searchScopeKeyword(run, locale).location.displayName}
        />
        <time dateTime={run.createdAt} className="text-xs text-fg-muted">
          {format.dateTime(new Date(run.createdAt), searchTimeFormat)}
        </time>
        {run.overviewFetched && <PillBadge size="xs">{t("features.aiOverview.label")}</PillBadge>}
      </span>
    </span>
  );
}
