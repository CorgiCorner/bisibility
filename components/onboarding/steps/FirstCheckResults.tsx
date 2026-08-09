"use client";

import { feedbackClass } from "@/components/onboarding/onboarding-form-utils";
import { rankObservationState } from "@/lib/serp/rank-depth";
import {
  CheckCircleIcon as CheckCircle,
  CircleNotchIcon as CircleNotch,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import type { FirstCheckResultRow, FirstCheckRunState } from "./use-first-check-run";

type FirstCheckResultsProps = {
  state: FirstCheckRunState;
};

function rankingLabel(position: number | null, rankingUrl: string | null) {
  const observation = rankObservationState({ completedChecks: 1, position });
  if (observation.kind !== "ranked") return observation.label;
  if (!rankingUrl) return `#${position}`;

  try {
    const url = new URL(rankingUrl);
    return `#${position} · ${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return `#${position} · ${rankingUrl}`;
  }
}

function observedLabel(row: Extract<FirstCheckResultRow, { status: "observed" }>) {
  return `Observed #${row.position.toFixed(1)} · ${row.clicks} clicks · ${row.impressions} impressions`;
}

function ResultIcon({ row }: Readonly<{ row: FirstCheckResultRow }>) {
  if (row.status === "pending") {
    return <CircleNotch aria-hidden className="bv-spin text-accent-text" size={16} weight="bold" />;
  }
  if (row.status === "failed") {
    return <WarningCircle aria-hidden className="text-yellow-text" size={16} weight="bold" />;
  }
  return <CheckCircle aria-hidden className="text-green-text" size={16} weight="fill" />;
}

function resultText(row: FirstCheckResultRow) {
  switch (row.status) {
    case "pending":
      return "Checking...";
    case "completed":
      return rankingLabel(row.position, row.rankingUrl);
    case "failed":
      return row.message;
    case "observed":
      return observedLabel(row);
  }
}

export function FirstCheckResults({ state }: Readonly<FirstCheckResultsProps>) {
  if (state.rows.length === 0 && !state.message) return null;

  return (
    <div className="mt-4">
      {state.rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          {state.rows.map((row, index) => (
            <div className={index % 2 === 0 ? "bg-bg-sunken" : "bg-bg-elev"} key={row.keywordId}>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 px-4 py-3">
                <span className="truncate text-[13px] font-medium text-fg">{row.text}</span>
                <span
                  className={`inline-flex min-w-0 items-center justify-end gap-2 text-right ${feedbackClass} ${
                    row.status === "failed" ? "text-yellow-text" : "text-fg-muted"
                  }`}
                >
                  <ResultIcon row={row} />
                  <span className="truncate">{resultText(row)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {state.message ? (
        <p
          className={`m-0 mt-3 ${feedbackClass} ${
            state.status === "failed" ? "text-red-text" : "text-fg-muted"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
