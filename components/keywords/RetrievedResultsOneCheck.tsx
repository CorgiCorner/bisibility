"use client";

import { Button, InfoTooltip, Tooltip } from "@/components/ui";
import type { RetrievedResults } from "@/lib/checks/contract";
import { featureChips } from "@/lib/checks/retrieved-results-model";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react";
import { useRef } from "react";
import { RetrievedResultsLadder } from "./RetrievedResultsLadder";

const RETENTION_TIP =
  "Hosted workspaces keep full detail for a fixed window. Self hosted instances keep it for as long as you keep the database.";
const AI_OVERVIEW_NOTE =
  "Your position counts organic results only. An AI overview sat above them at this check.";
const AI_OVERVIEW_UNKNOWN =
  "This provider does not report AI overviews, so this check cannot say whether one appeared.";

type Props = {
  rankingUrl: string | null;
  results: RetrievedResults;
  retentionDays: number | null;
  formatDate: (iso: string) => string;
};

function Eyebrow({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <span className="font-sans tabular-nums text-[10px] uppercase tracking-[0.08em] text-fg-muted">
      {children}
    </span>
  );
}

function FeatureRow({ features }: Readonly<{ features: readonly string[] }>) {
  const chips = featureChips(features);
  if (chips.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5"
      data-testid="retrieved-features"
    >
      <Eyebrow>On the page</Eyebrow>
      {chips.map((chip) => (
        <Tooltip content={chip.description} key={chip.label} semantics="description">
          <span className="rounded-full border border-border px-2.5 py-1 font-sans tabular-nums text-[10.5px] text-fg">
            {chip.label}
          </span>
        </Tooltip>
      ))}
    </div>
  );
}

function EmptyState({
  results,
  formatDate,
}: Readonly<{
  results: Extract<RetrievedResults, { tier: "none" }>;
  formatDate: (iso: string) => string;
}>) {
  return (
    <div className="m-4 rounded-control border border-dashed border-border bg-bg-sunken p-4">
      <p className="m-0 text-[13px] font-semibold text-fg">No stored results for this check</p>
      <p className="m-0 mt-1 text-[12.5px] leading-5 text-fg-muted">
        This check ran on {formatDate(results.checkedAt)}, before results were stored. Its position,
        and the history built from it, are unaffected.
      </p>
    </div>
  );
}

function CompactState({
  results,
}: Readonly<{ results: Extract<RetrievedResults, { tier: "compact" }> }>) {
  return (
    <div className="p-4 sm:p-5">
      <p className="m-0 text-[12.5px] leading-5 text-fg-muted">
        Compact record. One row per domain with its best position survived; titles, URLs, page
        features and unretrieved positions did not.
      </p>
      <ul className="m-0 mt-3 list-none p-0">
        {results.domains.map((entry) => (
          <li
            className="flex justify-between border-b border-border py-2 text-[12.5px]"
            key={entry.domain}
          >
            <span>{entry.domain}</span>
            <span className="font-sans tabular-nums text-fg-muted">#{entry.bestPosition}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-3 text-[12px] text-fg-muted">
        A compact record cannot be compared against a full one. Comparison stays available between
        checks that both hold full detail.
      </p>
    </div>
  );
}

export function RetrievedResultsOneCheck({
  rankingUrl,
  results,
  retentionDays,
  formatDate,
}: Readonly<Props>) {
  const trackedRef = useRef<HTMLLIElement | null>(null);
  if (results.tier === "none") return <EmptyState formatDate={formatDate} results={results} />;
  if (results.tier === "compact") return <CompactState results={results} />;
  const url = rankingUrl ?? results.rows.find((row) => row.tracked)?.url;
  return (
    <div>
      <FeatureRow features={results.features} />
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-5"
        data-testid="retrieved-summary"
      >
        <Eyebrow>Your result</Eyebrow>
        <strong className="font-sans tabular-nums text-[14px] text-fg">
          {results.trackedPosition === null ? "not found" : `#${results.trackedPosition}`}
        </strong>
        {url ? (
          <span className="min-w-0 flex-1 truncate font-sans tabular-nums text-[11.5px] text-fg-muted">
            {url}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {results.trackedPosition !== null ? (
          <Button
            onClick={() =>
              trackedRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
            }
            size="xs"
            variant="secondary"
          >
            <ArrowDown aria-hidden size={13} weight="regular" />
            Jump to your result
          </Button>
        ) : null}
      </div>
      {results.aiOverview === null ? (
        <p className="m-0 border-b border-border px-5 py-2 text-[12px] text-fg-muted">
          {AI_OVERVIEW_UNKNOWN}
        </p>
      ) : null}
      {results.aiOverview ? (
        <p className="m-0 border-b border-border px-5 py-2 text-[12px] text-fg-muted">
          {AI_OVERVIEW_NOTE}
        </p>
      ) : null}
      <RetrievedResultsLadder results={results} trackedRef={trackedRef} />
      <p className="m-0 flex items-center gap-1.5 border-t border-border px-4 py-3 text-[12px] text-fg-muted sm:px-5">
        {results.fullDetailUntil === null
          ? "Full detail is kept for as long as you keep the database."
          : `Full detail is kept for ${retentionDays ?? 0} days on hosted workspaces.`}
        <InfoTooltip text={RETENTION_TIP} />
      </p>
    </div>
  );
}
