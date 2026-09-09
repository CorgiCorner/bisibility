"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import type { CheckAttempt, CheckRunRow } from "@/lib/checks/contract";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/dist/ssr/XCircle";
import type { ReactNode } from "react";
import { CheckRunDetailsRow, splitCheckRunDetailLine } from "./CheckRunDetailsRow";
import { checkRunStoredResultLines } from "./CheckRunStoredResults";
import {
  formatAttemptOutcome,
  formatDuration,
  formatMoney,
  formatRunCost,
  formatWhen,
  isInternalErrorString,
} from "./check-runs-format";
import type { RunTableColumns } from "./use-run-table-width";

export const countryLevelTooltip =
  "Fallback provider doesn't support city-level locations - this check ran at country level, so the position may not be comparable with your city history.";

export function CountryLevelBadge() {
  return (
    <Tooltip content={countryLevelTooltip}>
      <button
        aria-label={`country-level: ${countryLevelTooltip}`}
        className="inline-flex cursor-help rounded-full border border-dashed border-yellow/55 bg-yellow/10 px-1.5 py-0.5 font-sans tabular-nums text-[9.5px] font-semibold text-yellow-text"
        type="button"
      >
        country-level
      </button>
    </Tooltip>
  );
}

function AttemptTone({
  attempt,
  failedRun,
}: Readonly<{ attempt: CheckAttempt; failedRun: boolean }>) {
  if (attempt.outcome === "ok" && !failedRun) {
    return <CheckCircle aria-hidden className="text-green-text" size={15} weight="regular" />;
  }
  if (attempt.outcome === "rate_limited") {
    return <WarningCircle aria-hidden className="text-yellow-text" size={15} weight="regular" />;
  }
  return <XCircle aria-hidden className="text-red-text" size={15} weight="regular" />;
}

function fallbackOutcome(run: CheckRunRow, index: number) {
  const attempt = run.attempts[index];
  if (!run.viaFallback || attempt?.outcome !== "ok" || index === 0) return null;
  let primary: CheckAttempt | undefined;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (run.attempts[cursor]?.outcome !== "ok") {
      primary = run.attempts[cursor];
      break;
    }
  }
  if (!primary) return null;
  const reasons: Record<Exclude<CheckAttempt["outcome"], "ok">, string> = {
    credentials_unavailable: "credentials unavailable",
    provider_failed: "failed",
    rate_limited: "rate-limited",
  };
  if (primary.outcome === "ok") return null;
  const reason = reasons[primary.outcome];
  const position =
    typeof run.position === "number"
      ? ` · #${run.position}${
          typeof run.requestedDepth === "number" ? ` of top ${run.requestedDepth}` : ""
        }`
      : "";
  return `via backup (${attempt.providerLabel}) - ${primary.providerLabel} ${reason}${position}`;
}

function attemptRows(attempt: CheckAttempt, index: number, run: CheckRunRow): CheckRunDetailLine[] {
  const failedRun = run.status === "failed";
  const attemptOutcome = formatAttemptOutcome(attempt, failedRun);
  const outcome = failedRun
    ? attemptOutcome
    : (fallbackOutcome(run, index) ??
      (attempt.outcome === "ok" && typeof run.position === "number"
        ? `${attemptOutcome} · #${run.position}${
            typeof run.requestedDepth === "number" ? ` of top ${run.requestedDepth}` : ""
          }`
        : attemptOutcome));
  return splitCheckRunDetailLine(outcome).map((line, lineIndex) => ({
    content:
      lineIndex === 0 ? (
        <CheckRunDetailsRow>
          <AttemptTone attempt={attempt} failedRun={failedRun} />
          <strong className="w-36 shrink-0 truncate font-semibold text-fg">
            {attempt.providerLabel}
          </strong>
          <span>{line}</span>
          {attempt.degradedToCountry ? <CountryLevelBadge /> : null}
          <span className="ml-auto">
            {typeof attempt.costCents === "number" ? formatMoney(attempt.costCents) : "-"}
          </span>
          <span>{formatDuration(attempt.durationMs) ?? "-"}</span>
        </CheckRunDetailsRow>
      ) : (
        <CheckRunDetailsRow>
          <span className="ml-44">{line}</span>
        </CheckRunDetailsRow>
      ),
    id: `${run.id}-attempt-${index}-${lineIndex}`,
  }));
}

type DetailsProps = {
  columns: RunTableColumns;
  keywordHref: string;
  now: Date;
  run: CheckRunRow;
};

export type CheckRunDetailLine = {
  content: ReactNode;
  id: string;
};

function hiddenMetaRows({ columns, now, run }: Readonly<DetailsProps>): CheckRunDetailLine[] {
  const items: CheckRunDetailLine[] = [];
  if (!columns.depth) {
    items.push({
      content: (
        <CheckRunDetailsRow>
          Depth · {typeof run.requestedDepth === "number" ? `Top ${run.requestedDepth}` : "-"}
        </CheckRunDetailsRow>
      ),
      id: `${run.id}-meta-depth`,
    });
  }
  if (!columns.cost) {
    items.push({
      content: <CheckRunDetailsRow>Cost · {formatRunCost(run)}</CheckRunDetailsRow>,
      id: `${run.id}-meta-cost`,
    });
  }
  if (!columns.when) {
    items.push({
      content: <CheckRunDetailsRow>When · {formatWhen(run, now)}</CheckRunDetailsRow>,
      id: `${run.id}-meta-when`,
    });
  }
  return items;
}

export function checkRunDetailLines({ columns, keywordHref, now, run }: Readonly<DetailsProps>) {
  const duration =
    run.status === "failed" && /timed out|stale running/i.test(run.error ?? "")
      ? "Timed out after 15 min"
      : formatDuration(run.durationMs);
  const lines: CheckRunDetailLine[] = [
    {
      content: (
        <CheckRunDetailsRow>
          <strong className="font-semibold text-fg">
            {run.attempts.length > 0 ? "Provider chain" : "Run details"}
          </strong>
          {run.trigger ? <span className="capitalize">· {run.trigger}</span> : null}
          {run.status === "failed" ? <span>· All providers failed</span> : null}
          {duration ? <span>· {duration}</span> : null}
        </CheckRunDetailsRow>
      ),
      id: `${run.id}-summary`,
    },
    ...hiddenMetaRows({ columns, keywordHref, now, run }),
  ];
  if (run.status === "failed" && run.error && isInternalErrorString(run.error)) {
    lines.push(
      ...splitCheckRunDetailLine(run.error).map((line, index) => ({
        content: (
          <CheckRunDetailsRow className="rounded-control bg-bg-inset px-2.5">
            {line}
          </CheckRunDetailsRow>
        ),
        id: `${run.id}-error-${index}`,
      })),
    );
  }
  for (const [index, attempt] of run.attempts.entries()) {
    lines.push(...attemptRows(attempt, index, run));
  }
  lines.push(...checkRunStoredResultLines({ keywordHref, run }));
  return lines;
}
