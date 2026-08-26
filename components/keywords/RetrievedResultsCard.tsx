"use client";

import { CountryLevelBadge } from "@/components/checks/runs/CheckRunDetails";
import { Card, InfoTooltip, SectionTitle, Tooltip } from "@/components/ui";
import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import { featureChips, retentionFooter } from "@/lib/checks/retrieved-results-model";
import { useState } from "react";
import { RetrievedResultsCompare } from "./RetrievedResultsCompare";
import { RetrievedResultsLadder } from "./RetrievedResultsLadder";
import { RetrievedResultsPicker } from "./RetrievedResultsPicker";

const TITLE_TIP =
  "A check fetches results until it finds your domain, then stops. This card keeps what it fetched, and states the positions it never asked for.";
const RETENTION_TIP =
  "Hosted workspaces keep full detail for a fixed window. Self hosted instances keep it for as long as you keep the database.";
const AI_OVERVIEW_NOTE =
  "Your position counts organic results only. An AI overview sat above them at this check.";
const AI_OVERVIEW_UNKNOWN =
  "This provider does not report AI overviews, so this check cannot say whether one appeared.";

type LoadResults = (checkIds: string[]) => Promise<RetrievedResults[]>;

type CardProps = {
  entries: readonly StoredResultsIndexEntry[];
  initialResults: RetrievedResults | null;
  loadResults: LoadResults;
  /** Ranking URL of the tracked result, for the pinned summary bar. */
  rankingUrl: string | null;
  retentionDays: number | null;
  timeZone: string;
};

function Eyebrow({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="m-0 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
      {children}
    </p>
  );
}

function SummaryBar({
  position,
  rankingUrl,
}: Readonly<{ position: number | null; rankingUrl: string | null }>) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-control bg-bg-sunken px-3.5 py-2.5">
      <Eyebrow>Your result</Eyebrow>
      <span className="font-mono text-[15px] font-semibold text-fg">
        {position === null ? "not found" : `#${position}`}
      </span>
      {rankingUrl ? (
        <span className="min-w-0 truncate font-mono text-[11.5px] text-fg-muted">{rankingUrl}</span>
      ) : null}
    </div>
  );
}

function FeatureChips({ features }: Readonly<{ features: readonly string[] }>) {
  const chips = featureChips(features);
  if (chips.length === 0) return null;
  return (
    <div className="grid gap-1.5">
      <Eyebrow>On the page</Eyebrow>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <Tooltip content={chip.description} key={chip.label} semantics="description">
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10.5px] text-fg-muted">
              {chip.label}
            </span>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function OneCheck({
  rankingUrl,
  results,
  retentionDays,
  timeZone,
}: Readonly<{
  rankingUrl: string | null;
  results: RetrievedResults;
  retentionDays: number | null;
  timeZone: string;
}>) {
  const formatDate = dateFormatter(timeZone);
  if (results.tier === "none") {
    return (
      <div className="rounded-control border border-dashed border-border bg-bg-sunken p-4">
        <p className="m-0 text-[13px] font-semibold text-fg">No stored results for this check</p>
        <p className="m-0 mt-1 text-[12.5px] leading-[1.55] text-fg-muted">
          This check ran on {formatDate(results.checkedAt)}, before results were stored. Its
          position, and the history built from it, are unaffected.
        </p>
      </div>
    );
  }
  if (results.tier === "compact") {
    return (
      <div className="grid gap-3">
        <p className="m-0 text-[12.5px] leading-[1.55] text-fg-muted">
          Compact record. One row per domain with its best position survived; titles, URLs, page
          features and unretrieved positions did not.
        </p>
        <div className="grid gap-1.5">
          <Eyebrow>Domains kept, best position</Eyebrow>
          <ul className="m-0 grid list-none gap-1 p-0">
            {results.domains.map((entry) => (
              <li
                className="flex items-baseline justify-between gap-3 border-b border-border-soft py-1.5 text-[12.5px] last:border-b-0"
                key={entry.domain}
              >
                <span className="min-w-0 truncate text-fg">{entry.domain}</span>
                <span className="font-mono text-fg-muted">#{entry.bestPosition}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="m-0 text-[12px] leading-[1.55] text-fg-muted">
          A compact record cannot be compared against a full one. Comparison stays available between
          checks that both hold full detail.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <SummaryBar position={results.trackedPosition} rankingUrl={rankingUrl} />
      <FeatureChips features={results.features} />
      {results.aiOverview === null ? (
        <p className="m-0 text-[12px] leading-[1.55] text-fg-muted">{AI_OVERVIEW_UNKNOWN}</p>
      ) : null}
      {results.aiOverview ? (
        <p className="m-0 text-[12px] leading-[1.55] text-fg-muted">{AI_OVERVIEW_NOTE}</p>
      ) : null}
      <RetrievedResultsLadder onJump={() => undefined} results={results} />
      <p className="m-0 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5 text-[12px] leading-[1.55] text-fg-muted">
        {retentionFooter({
          formatDate,
          fullDetailUntil: results.fullDetailUntil,
          retentionDays,
        })}
        <InfoTooltip text={RETENTION_TIP} />
      </p>
    </div>
  );
}

function dateFormatter(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone });
  return (iso: string) => formatter.format(new Date(iso));
}

export function RetrievedResultsCard({
  entries,
  initialResults,
  loadResults,
  rankingUrl,
  retentionDays,
  timeZone,
}: Readonly<CardProps>) {
  const [mode, setMode] = useState<"one" | "compare">("one");
  const [selected, setSelected] = useState(entries[0]?.checkId ?? "");
  const [compareFrom, setCompareFrom] = useState(entries[1]?.checkId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Record<string, RetrievedResults>>(
    initialResults ? { [initialResults.checkId]: initialResults } : {},
  );
  const formatDate = dateFormatter(timeZone);

  if (entries.length === 0) return null;

  async function show(checkIds: string[]) {
    const missing = checkIds.filter((id) => id && !loaded[id]);
    if (missing.length === 0) return;
    try {
      const fetched = await loadResults(missing);
      setLoaded((current) => ({
        ...current,
        ...Object.fromEntries(fetched.map((entry) => [entry.checkId, entry])),
      }));
      setError(null);
    } catch {
      // A swallowed rejection would leave the body claiming it is loading forever.
      setError("Stored results could not be loaded. Try again.");
    }
  }

  const current = loaded[selected] ?? null;
  const earlier = loaded[compareFrom] ?? null;
  const fullEntries = entries.filter((entry) => entry.tier === "full");
  const degraded = entries.find((entry) => entry.checkId === selected)?.degradedToCountry ?? false;

  return (
    <Card className="overflow-visible rounded-card p-0" size="lg">
      <div className="grid gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SectionTitle>Retrieved results</SectionTitle>
            <InfoTooltip text={TITLE_TIP} />
          </div>
          <p className="m-0 mt-1 text-[12px] text-fg-muted">
            What Google returned around your result, kept from the moment of the check.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-border p-0.5">
            {(["one", "compare"] as const).map((option) => (
              <button
                aria-pressed={mode === option}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                  mode === option ? "bg-accent-soft text-fg" : "text-fg-muted hover:text-fg"
                }`}
                key={option}
                onClick={() => {
                  setMode(option);
                  void show(option === "one" ? [selected] : [selected, compareFrom]);
                }}
                type="button"
              >
                {option === "one" ? "One check" : "Compare two"}
              </button>
            ))}
          </div>
          {mode === "compare" ? (
            <RetrievedResultsPicker
              ariaLabel="Earlier check"
              entries={entries}
              formatDate={formatDate}
              onChange={(id) => {
                setCompareFrom(id);
                void show([id, selected]);
              }}
              value={compareFrom}
            />
          ) : null}
          <RetrievedResultsPicker
            ariaLabel={mode === "compare" ? "Later check" : "Stored checks"}
            entries={entries}
            formatDate={formatDate}
            onChange={(id) => {
              setSelected(id);
              void show(mode === "compare" ? [id, compareFrom] : [id]);
            }}
            value={selected}
          />
          {current?.tier === "full" && current.requestedDepth ? (
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10.5px] text-fg-muted">
              Depth {current.requestedDepth}
            </span>
          ) : null}
          {degraded ? <CountryLevelBadge /> : null}
          {current?.tier === "full" ? (
            <span className="font-mono text-[10.5px] text-fg-muted">
              {current.retrievedPositions}
              {current.requestedDepth ? ` of ${current.requestedDepth}` : ""} retrieved
            </span>
          ) : null}
        </div>
      </div>
      <div className="px-5 py-4">
        {mode === "compare" && earlier && current ? (
          <RetrievedResultsCompare
            from={earlier}
            fullCheckDates={fullEntries.map((entry) => entry.checkedAt)}
            fullPair={
              fullEntries.length >= 2
                ? { from: fullEntries[1].checkId, to: fullEntries[0].checkId }
                : null
            }
            onPickFullPair={(from, to) => {
              setCompareFrom(from);
              setSelected(to);
              void show([from, to]);
            }}
            timeZone={timeZone}
            to={current}
          />
        ) : null}
        {mode === "one" && current ? (
          <OneCheck
            rankingUrl={rankingUrl}
            results={current}
            retentionDays={retentionDays}
            timeZone={timeZone}
          />
        ) : null}
        {error ? (
          <p className="m-0 text-[12.5px] text-red-text" role="alert">
            {error}
          </p>
        ) : null}
        {!current && !error ? (
          <p className="m-0 text-[12.5px] text-fg-muted">Loading stored results...</p>
        ) : null}
      </div>
    </Card>
  );
}
