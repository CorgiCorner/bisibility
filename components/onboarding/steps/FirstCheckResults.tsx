"use client";

import { feedbackClass } from "@/components/onboarding/onboarding-form-utils";
import { Button } from "@/components/ui/Button";
import { SEND_UNCONFIRMED_REASON } from "@/lib/rank-check/runs/contract";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/constants";
import { rankObservationState } from "@/lib/serp/rank-depth";
import { ArrowClockwiseIcon as ArrowClockwise } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/dist/csr/CircleNotch";
import { DesktopIcon as Desktop } from "@phosphor-icons/react/dist/csr/Desktop";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { useTranslations } from "next-intl";
import type { FirstCheckResultRow, FirstCheckRunState } from "./use-first-check-run";

type FirstCheckResultsProps = {
  onRetryFailed?: () => void;
  state: FirstCheckRunState;
};

function rankingLabel(
  t: ReturnType<typeof useTranslations<"onboarding.firstCheck">>,
  position: number | null,
  rankingUrl: string | null,
  trackedDepth?: number,
) {
  const observation = rankObservationState({ completedChecks: 1, position, trackedDepth });
  if (observation.kind !== "ranked")
    return t("results.notRanked", { depth: trackedDepth ?? DEFAULT_SERP_DEPTH });
  if (!rankingUrl) return `#${position}`;

  try {
    const url = new URL(rankingUrl);
    return `#${position} / ${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return `#${position} / ${rankingUrl}`;
  }
}

function ResultIcon({ row }: Readonly<{ row: FirstCheckResultRow }>) {
  if (row.status === "ready") return null;
  if (row.status === "pending" || row.status === "running") {
    return (
      <CircleNotch aria-hidden className="bv-spin text-accent-text" size={16} weight="regular" />
    );
  }
  if (row.status === "queued") {
    return <CircleNotch aria-hidden className="text-accent-text" size={16} weight="regular" />;
  }
  if (
    row.status === "blocked" ||
    row.status === "cancelled" ||
    row.status === "deferred" ||
    row.status === "failed" ||
    row.status === "skipped"
  ) {
    return <WarningCircle aria-hidden className="text-red-text" size={16} weight="regular" />;
  }
  return <CheckCircle aria-hidden className="text-green-text" size={16} weight="regular" />;
}

function terminalResultText(
  t: ReturnType<typeof useTranslations<"onboarding.firstCheck">>,
  row: Extract<FirstCheckResultRow, { blockedReason: string | null }>,
) {
  if (row.status === "blocked") {
    return row.blockedReason === SEND_UNCONFIRMED_REASON
      ? t("results.failure.sendUnconfirmed")
      : t("results.failure.blocked");
  }
  switch (row.status) {
    case "cancelled":
      return t("results.failure.cancelled");
    case "deferred":
      return t("results.failure.deferred");
    case "failed":
      return t("results.failure.failed");
    case "skipped":
      return t("results.failure.skipped");
  }
}

function resultText(
  t: ReturnType<typeof useTranslations<"onboarding.firstCheck">>,
  row: FirstCheckResultRow,
) {
  switch (row.status) {
    case "ready":
      return t("results.notChecked");
    case "pending":
    case "running":
      return t("results.checking");
    case "queued":
      return t("results.queued");
    case "completed":
      return rankingLabel(t, row.position, row.rankingUrl, row.requestedDepth);
    case "blocked":
    case "cancelled":
    case "deferred":
    case "skipped":
      return terminalResultText(t, row);
    case "failed":
      if ("blockedReason" in row) return terminalResultText(t, row);
      switch (row.code) {
        case "budget_exhausted":
          return t("results.failure.budgetExhausted");
        case "no_provider":
          return t("results.failure.noProvider");
        case "project_read_only":
          return t("results.failure.projectReadOnly");
        case "rate_limited":
          return t("results.failure.rateLimited");
        case "sample_project":
          return t("results.failure.sampleProject");
        case "unexpected":
          return t("results.failure.unexpected");
        case "failed":
          return t("results.failure.failed");
        case "client_error":
          return row.message;
      }
  }
}

function ResultTarget({ row }: Readonly<{ row: FirstCheckResultRow }>) {
  const t = useTranslations("onboarding.firstCheck");
  const deviceLabel = row.device === "mobile" ? t("device.mobile") : t("device.desktop");
  const DeviceIcon = row.device === "mobile" ? DeviceMobile : Desktop;
  return (
    <span className="mt-1 flex min-w-0 items-center gap-1.5">
      <span className="inline-flex h-6 min-w-0 items-center gap-1 rounded-full border border-border bg-bg-elev px-2 text-[11px] text-fg">
        <span className="truncate">{row.market.locationLabel}</span>
        <span className="text-[10px] text-fg-muted">/</span>
        <span className="truncate text-fg-muted">{row.market.languageLabel}</span>
      </span>
      <span
        aria-label={t("results.device", { device: deviceLabel })}
        className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border text-fg-muted"
        role="img"
        title={t("results.device", { device: deviceLabel })}
      >
        <DeviceIcon aria-hidden size={13} weight="regular" />
      </span>
    </span>
  );
}

function resultsNote(
  t: ReturnType<typeof useTranslations<"onboarding.firstCheck">>,
  state: FirstCheckRunState,
) {
  const failed = state.rows.filter((row) => row.status === "failed").length;
  if (state.status === "running") return t("results.live");
  if (state.status === "queued") return t("results.queuedNote");
  if (failed === 1 && state.rows.length === 1) {
    return t("results.failed", { failed, total: state.rows.length });
  }
  if (failed > 0) {
    return t("results.failed", { failed, total: state.rows.length });
  }
  return t("results.retryNote");
}

export function FirstCheckResults({ onRetryFailed, state }: Readonly<FirstCheckResultsProps>) {
  const t = useTranslations("onboarding.firstCheck");
  if (state.rows.length === 0 && !state.message) return null;
  const hasFailed = state.rows.some((row) => row.status === "failed");
  const hasTerminalOutcome = state.rows.some(
    (row) =>
      row.status === "blocked" ||
      row.status === "cancelled" ||
      row.status === "deferred" ||
      row.status === "failed" ||
      row.status === "skipped",
  );
  const unknownCost = state.rows.some(
    (row) => row.status === "completed" && row.recordedCostCents === null,
  );
  const completed = state.rows.filter((row) => row.status === "completed").length;
  const recordedCostCents = state.rows.reduce(
    (total, row) => total + (row.status === "completed" ? (row.recordedCostCents ?? 0) : 0),
    0,
  );

  return (
    <div className="mt-4" data-analytics-mask>
      {state.rows.length > 0 ? (
        <div className="overflow-hidden rounded-card border border-border">
          {state.rows.map((row, index) => (
            <div className={index % 2 === 0 ? "bg-bg-sunken" : "bg-bg-elev"} key={row.keywordId}>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-fg">{row.text}</span>
                  <ResultTarget row={row} />
                </span>
                <span
                  className={`inline-flex min-w-0 items-center justify-end gap-2 text-right ${feedbackClass} ${
                    row.status === "blocked" ||
                    row.status === "cancelled" ||
                    row.status === "deferred" ||
                    row.status === "failed" ||
                    row.status === "skipped"
                      ? "text-red-text"
                      : "text-fg-muted"
                  }`}
                >
                  <ResultIcon row={row} />
                  <span className="truncate">{resultText(t, row)}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {state.rows.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
          <p className={`m-0 ${feedbackClass} font-medium text-fg-muted`}>
            {state.status === "completed"
              ? unknownCost
                ? t("results.completedUnavailable", {
                    completed,
                    total: state.rows.length,
                  })
                : hasTerminalOutcome
                  ? t("results.completedWithOutcomes", {
                      completed,
                      total: state.rows.length,
                    })
                  : t("results.completed", {
                      completed,
                      cost: recordedCostCents / 100,
                      total: state.rows.length,
                    })
              : resultsNote(t, state)}
          </p>
          {hasFailed && onRetryFailed ? (
            <Button
              disabled={state.status === "queued" || state.status === "running"}
              onClick={onRetryFailed}
              size="sm"
              startIcon={<ArrowClockwise aria-hidden size={12} weight="regular" />}
              type="button"
              variant="secondary"
            >
              {t("results.retry")}
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
