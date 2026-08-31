"use client";

import type { RetrievedResults, RetrievedRow } from "@/lib/checks/contract";
import { gapBlock } from "@/lib/checks/retrieved-results-model";
import { type RefObject, useCallback, useRef } from "react";

const ROW_HEIGHT = 65;
const CONTEXT_ROWS = 3;

type LadderProps = {
  results: Extract<RetrievedResults, { tier: "full" }>;
  trackedRef?: RefObject<HTMLLIElement | null>;
};

function rowLabel(row: RetrievedRow) {
  const target = row.url ?? row.domain;
  return row.tracked
    ? `Your result, position ${row.position}, ${target}`
    : `Position ${row.position}, ${target}`;
}

function LadderRow({
  row,
  trackedRef,
}: Readonly<{ row: RetrievedRow; trackedRef?: RefObject<HTMLLIElement | null> }>) {
  return (
    <li
      aria-label={rowLabel(row)}
      className={`relative grid min-h-[64px] grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border-soft px-4 py-2.5 last:border-b-0 sm:gap-3 sm:px-6 ${row.tracked ? "m-3 rounded-control border border-border-control px-3 last:border-b sm:px-4" : ""}`}
      data-tracked={row.tracked ? "true" : undefined}
      ref={row.tracked ? trackedRef : undefined}
    >
      <span
        className={`font-mono text-[12px] ${row.tracked ? "font-semibold text-fg" : "text-fg-muted"}`}
      >
        #{row.position}
      </span>
      <span className="min-w-0">
        {row.url ? (
          <a
            className="block truncate text-[13px] font-medium text-fg hover:text-accent-text"
            href={row.url}
            rel="noreferrer noopener"
            target="_blank"
          >
            {row.title ?? row.domain}
          </a>
        ) : (
          <span className="block truncate text-[13px] font-medium text-fg">
            {row.title ?? row.domain}
          </span>
        )}
        <span className="mt-0.5 block truncate font-mono text-[11px] text-fg-muted">
          {row.domain}
        </span>
      </span>
      {row.tracked ? (
        <span className="rounded-full border border-accent-solid px-2.5 py-1 font-mono text-[10px] font-medium text-accent-text">
          Your site
        </span>
      ) : null}
    </li>
  );
}

export function RetrievedResultsLadder({ results, trackedRef }: Readonly<LadderProps>) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const gap = gapBlock({
    requestedDepth: results.requestedDepth,
    retrievedPositions: results.retrievedPositions,
    stoppedAtResult: results.stoppedAtResult,
  });
  const trackedIndex = results.rows.findIndex((row) => row.tracked);
  const openAtTracked = useCallback(
    (node: HTMLElement | null) => {
      scrollerRef.current = node;
      if (node && trackedIndex >= 0)
        node.scrollTop = Math.max(0, trackedIndex * ROW_HEIGHT - CONTEXT_ROWS * ROW_HEIGHT);
    },
    [trackedIndex],
  );

  return (
    <section
      aria-label="Retrieved results"
      className="max-h-[420px] overflow-y-auto"
      key={results.checkId}
      ref={openAtTracked}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need one tab stop for the scroll region instead of every result link
      tabIndex={0}
    >
      <ol className="m-0 list-none p-0">
        {results.rows.map((row) => (
          <LadderRow key={`${row.position}-${row.domain}`} row={row} trackedRef={trackedRef} />
        ))}
      </ol>
      {gap ? (
        <div className="m-3 rounded-control border border-dashed border-border bg-bg-sunken p-3">
          <p className="m-0 font-mono text-[11px] font-medium uppercase text-fg-muted">
            {gap.heading}
          </p>
          <p className="m-0 mt-1 font-mono text-[11px] text-fg-muted">{gap.count}</p>
          <p className="m-0 mt-2 text-[12px] leading-5 text-fg-muted">{gap.reason}</p>
        </div>
      ) : null}
    </section>
  );
}
