"use client";
import { KeywordCheckScope } from "@/components/keywords/KeywordCheckScope";
import type { ComparisonRun } from "@/lib/provider-comparison/types";
import { useLocale } from "next-intl";
import { searchScopeKeyword } from "./search-scope";
export function PlaygroundQueryScope({ run }: { run: ComparisonRun }) {
  const locale = useLocale();
  return (
    <div className="grid min-w-0 gap-1.5">
      <p className="m-0 break-words text-sm font-medium">{run.keyword.text}</p>
      <KeywordCheckScope
        locationLabel={searchScopeKeyword(run, locale).location.displayName}
        keyword={searchScopeKeyword(run, locale)}
      />
    </div>
  );
}
