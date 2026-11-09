"use client";

import {
  SectionChevron,
  useSectionDisclosure,
} from "@/components/keyword-detail-history/section-disclosure";
import { Card } from "@/components/ui/Card";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import type { TrackedCompetitor } from "@/lib/competitors/serp-comparison";
import { ClockCounterClockwiseIcon as History } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { useTranslations } from "next-intl";
import { RetrievedResultsPicker } from "./RetrievedResultsPicker";
import { SerpCompetitorComparison } from "./SerpCompetitorComparison";

export function CompetitorSnapshotCard({
  competitors,
  ownDomain,
  results,
  entries,
  selected,
  selectedFrom,
  onSelect,
  formatDate,
  formatDateTime,
  error,
}: Readonly<{
  competitors: readonly TrackedCompetitor[];
  ownDomain: string;
  results: RetrievedResults | null;
  entries: readonly StoredResultsIndexEntry[];
  selected: string;
  selectedFrom?: string;
  onSelect: (checkId: string) => void;
  formatDate: (iso: string) => string;
  formatDateTime: (iso: string) => string;
  error: string | null;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  const { open, toggle } = useSectionDisclosure("competitor-snapshot");
  if (competitors.length === 0 || entries.length === 0) return null;
  return (
    <Card
      component="section"
      aria-label={t("competitorsInCheck")}
      className="overflow-hidden p-0"
      size="lg"
    >
      <div className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <SectionTitle>{t("competitorsInCheck")}</SectionTitle>
            <InfoTooltip text={t("competitorDescription")} />
          </div>
          <p className="m-0 mt-1 text-xs text-fg-muted">{t("competitorSubtitle")}</p>
        </div>
        <div className="flex min-h-9 min-w-0 items-center gap-4 sm:justify-self-end [&>button]:min-w-0">
          <div className="min-w-0 flex-1 sm:flex-none">
            <RetrievedResultsPicker
              ariaLabel={t("competitorCheck")}
              entries={entries}
              formatDate={formatDate}
              formatDateTime={formatDateTime}
              leadingIcon={<History aria-hidden size={14} weight="regular" />}
              onChange={onSelect}
              pickerRole={selectedFrom ? "to" : "one"}
              selectedFrom={selectedFrom}
              value={selected}
            />
          </div>
          <SectionChevron open={open} toggle={toggle} title={t("competitorsInCheck")} />
        </div>
      </div>
      <div hidden={!open}>
        {results && results.tier !== "none" ? (
          <SerpCompetitorComparison
            results={results}
            competitors={competitors}
            ownDomain={ownDomain}
          />
        ) : (
          <p className="m-0 px-4 pb-4 text-[12px] text-fg-muted sm:px-5">
            {error ?? (results ? t("noStoredTitle") : t("loading"))}
          </p>
        )}
      </div>
    </Card>
  );
}
