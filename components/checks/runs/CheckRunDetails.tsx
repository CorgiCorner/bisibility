"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import type { CheckAttempt, CheckRunRow } from "@/lib/checks/contract";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/dist/ssr/XCircle";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CheckRunDetailsRow, splitCheckRunDetailLine } from "./CheckRunDetailsRow";
import { checkRunStoredResultLines } from "./CheckRunStoredResults";
import {
  type CheckRunsTranslations,
  formatAttemptOutcome,
  formatDuration,
  formatMoney,
  formatRunCost,
  formatWhen,
  isInternalErrorString,
} from "./check-runs-format";
import type { RunTableColumns } from "./use-run-table-width";

export function CountryLevelBadge({
  ariaLabel,
  label,
  tooltip,
}: Readonly<{ ariaLabel?: string; label?: string; tooltip?: string }>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  const badgeLabel = label ?? t("countryLevelShort");
  const badgeTooltip = tooltip ?? t("countryLevelRunTooltip");
  return (
    <Tooltip content={badgeTooltip}>
      <button
        aria-label={
          ariaLabel ?? t("countryLevelRunAria", { label: badgeLabel, tooltip: badgeTooltip })
        }
        className="inline-flex cursor-help rounded-full border border-dashed border-yellow/55 bg-yellow/10 px-1.5 py-0.5 font-sans tabular-nums text-[9.5px] font-semibold text-yellow-text"
        type="button"
      >
        {badgeLabel}
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

function fallbackOutcome(run: CheckRunRow, index: number, t: CheckRunsTranslations) {
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
    credentials_unavailable: t("credentialsUnavailableLower"),
    provider_failed: t("failedLower"),
    rate_limited: t("rateLimitedLower"),
  };
  if (primary.outcome === "ok") return null;
  const reason = reasons[primary.outcome];
  const position =
    typeof run.position === "number"
      ? t("fallbackPosition", {
          depth: run.requestedDepth ?? 0,
          hasDepth: String(typeof run.requestedDepth === "number"),
          position: run.position,
        })
      : "";
  return t("viaBackup", {
    attemptProvider: attempt.providerLabel,
    position,
    primaryProvider: primary.providerLabel,
    reason,
  });
}

function attemptRows(
  attempt: CheckAttempt,
  index: number,
  run: CheckRunRow,
  locale: string,
  t: CheckRunsTranslations,
): CheckRunDetailLine[] {
  const failedRun = run.status === "failed";
  const attemptOutcome = formatAttemptOutcome(attempt, { t }, failedRun);
  const outcome = failedRun
    ? attemptOutcome
    : (fallbackOutcome(run, index, t) ??
      (attempt.outcome === "ok" && typeof run.position === "number"
        ? t("attemptPosition", {
            depth: run.requestedDepth ?? 0,
            hasDepth: String(typeof run.requestedDepth === "number"),
            outcome: attemptOutcome,
            position: run.position,
          })
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
            {typeof attempt.costCents === "number"
              ? formatMoney(attempt.costCents, { locale })
              : t("notAvailable")}
          </span>
          <span>{formatDuration(attempt.durationMs, { t }) ?? t("notAvailable")}</span>
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
  locale: string;
  now: Date;
  run: CheckRunRow;
  t: CheckRunsTranslations;
};

export type CheckRunDetailLine = {
  content: ReactNode;
  id: string;
};

function hiddenMetaRows({
  columns,
  locale,
  now,
  run,
  t,
}: Readonly<DetailsProps>): CheckRunDetailLine[] {
  const items: CheckRunDetailLine[] = [];
  if (!columns.depth) {
    items.push({
      content: (
        <CheckRunDetailsRow>
          {t("detailDepth", {
            depth: run.requestedDepth ?? 0,
            hasDepth: String(typeof run.requestedDepth === "number"),
          })}
        </CheckRunDetailsRow>
      ),
      id: `${run.id}-meta-depth`,
    });
  }
  if (!columns.cost) {
    items.push({
      content: (
        <CheckRunDetailsRow>
          {t("detailCost", { cost: formatRunCost(run, { locale, t }) })}
        </CheckRunDetailsRow>
      ),
      id: `${run.id}-meta-cost`,
    });
  }
  if (!columns.when) {
    items.push({
      content: (
        <CheckRunDetailsRow>
          {t("detailWhen", { when: formatWhen(run, now, { t }) })}
        </CheckRunDetailsRow>
      ),
      id: `${run.id}-meta-when`,
    });
  }
  return items;
}

export function checkRunDetailLines({
  columns,
  keywordHref,
  locale,
  now,
  run,
  t,
}: Readonly<DetailsProps>) {
  const duration =
    run.status === "failed" && /timed out|stale running/i.test(run.error ?? "")
      ? t("timedOut", { count: 15 })
      : formatDuration(run.durationMs, { t });
  const lines: CheckRunDetailLine[] = [
    {
      content: (
        <CheckRunDetailsRow>
          <strong className="font-semibold text-fg">
            {run.attempts.length > 0 ? t("providerChain") : t("runDetails")}
          </strong>
          {run.trigger ? <span>· {t(run.trigger)}</span> : null}
          {run.status === "failed" ? <span>· {t("allProvidersFailed")}</span> : null}
          {duration ? <span>· {duration}</span> : null}
        </CheckRunDetailsRow>
      ),
      id: `${run.id}-summary`,
    },
    ...hiddenMetaRows({ columns, keywordHref, locale, now, run, t }),
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
    lines.push(...attemptRows(attempt, index, run, locale, t));
  }
  lines.push(...checkRunStoredResultLines({ keywordHref, run, t }));
  return lines;
}
