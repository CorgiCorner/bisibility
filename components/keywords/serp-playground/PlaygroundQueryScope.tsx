"use client";
import { KeywordCheckScope } from "@/components/keywords/KeywordCheckScope";
import type { ComparisonRun } from "@/lib/provider-comparison/types";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { searchScopeKeyword, searchTimeFormat } from "./search-scope";
export function PlaygroundQueryScope({ run }: { run: ComparisonRun }) {
  const locale = useLocale(),
    format = useFormatter(),
    t = useTranslations("projectRankTracker.serpPlayground");
  return (
    <div className="grid min-w-0 gap-1.5">
      <p className="m-0 break-words text-sm font-medium">{run.keyword.text}</p>
      <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <KeywordCheckScope
          as="span"
          locationLabel={searchScopeKeyword(run, locale).location.displayName}
          keyword={searchScopeKeyword(run, locale)}
        />
        <time dateTime={run.createdAt} className="text-xs text-fg-muted">
          {t("searchedAt", { date: format.dateTime(new Date(run.createdAt), searchTimeFormat) })}
        </time>
      </span>
    </div>
  );
}
