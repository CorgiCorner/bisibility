"use client";

import { feedbackClass } from "@/components/onboarding/onboarding-form-utils";
import { Button } from "@/components/ui";
import { rankObservationState } from "@/lib/serp/rank-depth";
import {
  ArrowClockwiseIcon as ArrowClockwise,
  CheckCircleIcon as CheckCircle,
  CircleNotchIcon as CircleNotch,
  DesktopIcon as Desktop,
  DeviceMobileIcon as DeviceMobile,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import type { FirstCheckResultRow, FirstCheckRunState } from "./use-first-check-run";

type FirstCheckResultsProps = {
  onRetryFailed?: () => void;
  state: FirstCheckRunState;
};

function rankingLabel(position: number | null, rankingUrl: string | null) {
  const observation = rankObservationState({ completedChecks: 1, position });
  if (observation.kind !== "ranked") return observation.label;
  if (!rankingUrl) return `#${position}`;

  try {
    const url = new URL(rankingUrl);
    return `#${position} / ${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return `#${position} / ${rankingUrl}`;
  }
}

function observedLabel(row: Extract<FirstCheckResultRow, { status: "observed" }>) {
  return `Observed #${row.position.toFixed(1)} / ${row.clicks} clicks / ${row.impressions} impressions`;
}

function ResultIcon({ row }: Readonly<{ row: FirstCheckResultRow }>) {
  if (row.status === "pending") {
    return <CircleNotch aria-hidden className="bv-spin text-accent-text" size={16} weight="bold" />;
  }
  if (row.status === "failed") {
    return <WarningCircle aria-hidden className="text-red-text" size={16} weight="bold" />;
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

function ResultTarget({ row }: Readonly<{ row: FirstCheckResultRow }>) {
  if (row.status === "observed") return null;
  const deviceLabel = row.device === "mobile" ? "Mobile" : "Desktop";
  const DeviceIcon = row.device === "mobile" ? DeviceMobile : Desktop;
  return (
    <span className="mt-1 flex min-w-0 items-center gap-1.5">
      <span className="inline-flex h-6 min-w-0 items-center gap-1 rounded-full border border-border bg-bg-elev px-2 text-[11px] text-fg">
        <span className="truncate">{row.market.locationLabel}</span>
        <span className="font-mono text-[10px] text-fg-muted">/</span>
        <span className="truncate text-fg-muted">{row.market.languageLabel}</span>
      </span>
      <span
        aria-label={`${deviceLabel} device`}
        className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-fg-muted"
        role="img"
        title={`${deviceLabel} device`}
      >
        <DeviceIcon aria-hidden size={13} weight="bold" />
      </span>
    </span>
  );
}

function resultsNote(state: FirstCheckRunState) {
  const failed = state.rows.filter((row) => row.status === "failed").length;
  if (state.status === "running") return "Live checks usually return within a minute.";
  if (failed > 0) {
    return `${failed} of ${state.rows.length} checks failed. Successful results are kept.`;
  }
  return "Not in Top 100 is a valid result for a market and device.";
}

export function FirstCheckResults({ onRetryFailed, state }: Readonly<FirstCheckResultsProps>) {
  if (state.rows.length === 0 && !state.message) return null;
  const hasFailed = state.rows.some((row) => row.status === "failed");

  return (
    <div className="mt-4">
      {state.rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          {state.rows.map((row, index) => (
            <div className={index % 2 === 0 ? "bg-bg-sunken" : "bg-bg-elev"} key={row.keywordId}>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-fg">{row.text}</span>
                  <ResultTarget row={row} />
                </span>
                <span
                  className={`inline-flex min-w-0 items-center justify-end gap-2 text-right ${feedbackClass} ${
                    row.status === "failed" ? "text-red-text" : "text-fg-muted"
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
      {state.rows.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
          <p className={`m-0 ${feedbackClass} font-medium text-fg-muted`}>{resultsNote(state)}</p>
          {hasFailed && onRetryFailed ? (
            <Button
              onClick={onRetryFailed}
              size="sm"
              startIcon={<ArrowClockwise aria-hidden size={12} weight="bold" />}
              type="button"
              variant="secondary"
            >
              Retry failed
            </Button>
          ) : null}
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
