"use client";

import type { RetrievedResults } from "@/lib/checks/contract";
import type { TrackedCompetitor } from "@/lib/competitors/serp-comparison";
import { useTranslations } from "next-intl";
import { RetrievedResultsLadder } from "./RetrievedResultsLadder";

export function SnapshotExtensionResults({
  results,
  competitors,
  formatDateTime,
}: Readonly<{
  results: Extract<RetrievedResults, { tier: "full" }>;
  competitors: readonly TrackedCompetitor[];
  formatDateTime: (value: string) => string;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results.extension");
  const pages = results.extension?.pages ?? [];
  if (!pages.length) return null;
  return (
    <section aria-label={t("addedTitle")} className="border-t border-border">
      <div className="px-4 py-4 sm:px-5">
        <h3 className="m-0 text-[14px] font-semibold text-fg">{t("addedTitle")}</h3>
        <p className="mb-0 mt-1 text-[12px] leading-5 text-fg-muted">{t("timing")}</p>
      </div>
      {pages.map((page) => (
        <div key={page.start}>
          <div className="flex flex-wrap justify-between gap-2 border-y border-border bg-bg-sunken px-4 py-2 text-[12px] text-fg-muted sm:px-5">
            <span>
              {t("page", {
                start: page.start + 1,
                end: page.start + 10,
                time: formatDateTime(page.fetchedAt),
              })}
            </span>
            <span>
              {t("added", { count: page.rows.length, duplicates: page.skippedDuplicates })}
            </span>
          </div>
          {page.rows.length ? (
            <RetrievedResultsLadder
              competitors={competitors}
              results={{
                ...results,
                rows: page.rows,
                requestedDepth: null,
                retrievedPositions: page.start + 10,
                stoppedAtResult: false,
              }}
            />
          ) : (
            <p className="m-0 px-4 py-3 text-[12px] text-fg-muted sm:px-5">{t("emptyPage")}</p>
          )}
        </div>
      ))}
    </section>
  );
}
