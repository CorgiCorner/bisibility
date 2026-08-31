"use client";

import { CountryLevelBadge } from "@/components/checks/runs/CheckRunDetails";
import { Card } from "@/components/ui";
import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import { useState } from "react";
import { RetrievedResultsCompare } from "./RetrievedResultsCompare";
import { RetrievedResultsHeader } from "./RetrievedResultsHeader";
import { RetrievedResultsOneCheck } from "./RetrievedResultsOneCheck";

type LoadResults = (checkIds: string[]) => Promise<RetrievedResults[]>;
type CardProps = {
  entries: readonly StoredResultsIndexEntry[];
  initialResults: RetrievedResults | null;
  loadResults: LoadResults;
  rankingUrl: string | null;
  retentionDays: number | null;
  timeZone: string;
};

function dateFormatter(timeZone: string) {
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
  const dateTime = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    year: "numeric",
    timeZone,
  });
  return {
    date: (iso: string) => date.format(new Date(iso)),
    dateTime: (iso: string) => dateTime.format(new Date(iso)).replace(",", ","),
  };
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
  const format = dateFormatter(timeZone);
  const compareEnabled = entries.filter((entry) => entry.tier !== "none").length >= 2;
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
      setError("Stored results could not be loaded. Try again.");
    }
  }

  const current = loaded[selected] ?? null;
  const earlier = loaded[compareFrom] ?? null;
  const fullEntries = entries.filter((entry) => entry.tier === "full");
  const degraded = entries.find((entry) => entry.checkId === selected)?.degradedToCountry ?? false;
  return (
    <Card className="overflow-visible p-0" data-testid="retrieved-results-card" size="lg">
      <RetrievedResultsHeader
        compareEnabled={compareEnabled}
        compareFrom={compareFrom}
        current={current}
        entries={entries}
        formatDate={format.date}
        formatDateTime={format.dateTime}
        mode={mode}
        onMode={(next) => {
          if (next === "compare" && !compareEnabled) return;
          setMode(next);
          void show(next === "one" ? [selected] : [selected, compareFrom]);
        }}
        onSelectFrom={(id) => {
          setCompareFrom(id);
          void show([id, selected]);
        }}
        onSelectTo={(id) => {
          setSelected(id);
          void show(mode === "compare" ? [id, compareFrom] : [id]);
        }}
        selected={selected}
      />
      {degraded ? (
        <div className="border-b border-border px-5 py-2">
          <CountryLevelBadge />
        </div>
      ) : null}
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
        <RetrievedResultsOneCheck
          formatDate={format.date}
          rankingUrl={rankingUrl}
          results={current}
          retentionDays={retentionDays}
        />
      ) : null}
      {error ? (
        <p className="m-0 p-5 text-[12.5px] text-red-text" role="alert">
          {error}
        </p>
      ) : null}
      {!current && !error ? (
        <p className="m-0 p-5 text-[12.5px] text-fg-muted">Loading stored results...</p>
      ) : null}
    </Card>
  );
}
