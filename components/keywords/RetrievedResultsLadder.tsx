"use client";

import type { RetrievedResults, RetrievedRow } from "@/lib/checks/contract";
import { gapBlock } from "@/lib/checks/retrieved-results-model";
import { MapPinIcon as MapPin } from "@phosphor-icons/react";
import { useCallback, useRef } from "react";

const ROW_HEIGHT = 52;
const SUMMARY_CLEARANCE = 46;
const CONTEXT_ROWS = 3;
/** Below this the tracked row is on screen already, so the jump would move nothing. */
const JUMP_THRESHOLD = 3;

type LadderProps = {
  onJump?: () => void;
  results: Extract<RetrievedResults, { tier: "full" }>;
};

function rowLabel(row: RetrievedRow) {
  const target = row.url ?? row.domain;
  return row.tracked
    ? `Your result, position ${row.position}, ${target}`
    : `Position ${row.position}, ${target}`;
}

function LadderRow({ row }: Readonly<{ row: RetrievedRow }>) {
  return (
    <li
      aria-label={rowLabel(row)}
      className={`grid grid-cols-[42px_minmax(0,1fr)] items-start gap-3 border-b border-border-soft px-4 py-3 last:border-b-0 ${
        row.tracked ? "bg-accent-soft/40" : ""
      }`}
      data-tracked={row.tracked ? "true" : undefined}
    >
      <span
        className={`font-mono text-[12.5px] ${
          row.tracked ? "font-semibold text-fg" : "text-fg-muted"
        }`}
      >
        #{row.position}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          {row.url ? (
            <a
              className="min-w-0 truncate text-[13px] text-fg underline decoration-border underline-offset-4 hover:text-accent-text"
              href={row.url}
              rel="noreferrer noopener"
              target="_blank"
            >
              {row.title ?? row.domain}
            </a>
          ) : (
            <span className="min-w-0 truncate text-[13px] text-fg">{row.title ?? row.domain}</span>
          )}
          {row.tracked ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-accent-solid px-2 py-0.5 font-mono text-[10px] font-medium text-accent-text">
              <MapPin aria-hidden size={10} weight="fill" />
              Your site
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[11px] text-fg-muted">
          {row.domain}
        </span>
      </span>
    </li>
  );
}

export function RetrievedResultsLadder({ onJump, results }: Readonly<LadderProps>) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const gap = gapBlock({
    requestedDepth: results.requestedDepth,
    retrievedPositions: results.retrievedPositions,
    stoppedAtResult: results.stoppedAtResult,
  });
  const trackedIndex = results.rows.findIndex((row) => row.tracked);

  // The ladder never grows the card, so the opening offset is imperative. Keying the ref
  // callback on the check id reruns it on every check change without an effect.
  const openAtTracked = useCallback(
    (node: HTMLElement | null) => {
      scrollerRef.current = node;
      if (!node || trackedIndex < 0) return;
      node.scrollTop = Math.max(
        0,
        trackedIndex * ROW_HEIGHT - CONTEXT_ROWS * ROW_HEIGHT - SUMMARY_CLEARANCE,
      );
    },
    [trackedIndex],
  );

  return (
    <div className="grid gap-3">
      {/* A focusable scroll region lets a keyboard user page the ladder with arrow keys
          without tabbing through every result link. A section carries the role natively. */}
      <section
        aria-label="Retrieved results"
        className="max-h-[420px] overflow-y-auto rounded-[10px] border border-border"
        key={results.checkId}
        ref={openAtTracked}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region has to be a tab stop, otherwise the only way through a hundred results is tabbing every link in turn
        tabIndex={0}
      >
        <ol className="m-0 list-none p-0">
          {results.rows.map((row) => (
            <LadderRow key={`${row.position}-${row.domain}`} row={row} />
          ))}
        </ol>
        {gap ? (
          <div className="m-3 rounded-[10px] border border-dashed border-border bg-bg-sunken p-3">
            <p className="m-0 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-fg-muted">
              {gap.heading}
            </p>
            <p className="m-0 mt-1 font-mono text-[11px] text-fg-muted">{gap.count}</p>
            <p className="m-0 mt-2 text-[12px] leading-[1.55] text-fg-muted">{gap.reason}</p>
          </div>
        ) : null}
      </section>
      {trackedIndex >= JUMP_THRESHOLD && onJump ? (
        <button
          className="justify-self-start text-[12.5px] text-fg-muted underline decoration-border-strong underline-offset-4 transition-colors hover:text-fg"
          onClick={() => {
            const scroller = scrollerRef.current;
            const tracked = scroller?.querySelector<HTMLElement>('[data-tracked="true"] a');
            tracked?.focus();
            onJump();
          }}
          type="button"
        >
          Jump to your result
        </button>
      ) : null}
    </div>
  );
}
