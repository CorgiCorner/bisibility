import type { CheckAttempt, CheckRunRow } from "@/lib/checks/contract";
import Tooltip from "@mui/material/Tooltip";
import {
  CheckCircleIcon as CheckCircle,
  WarningCircleIcon as WarningCircle,
  XCircleIcon as XCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
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
    <Tooltip title={countryLevelTooltip}>
      <button
        aria-label={`country-level: ${countryLevelTooltip}`}
        className="inline-flex cursor-help rounded-full border border-dashed border-yellow/55 bg-yellow/10 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-yellow-text"
        type="button"
      >
        country-level
      </button>
    </Tooltip>
  );
}

function AttemptTone({ attempt }: Readonly<{ attempt: CheckAttempt }>) {
  if (attempt.outcome === "ok") {
    return <CheckCircle aria-hidden className="text-green-text" size={15} weight="fill" />;
  }
  if (attempt.outcome === "rate_limited") {
    return <WarningCircle aria-hidden className="text-yellow-text" size={15} weight="fill" />;
  }
  return <XCircle aria-hidden className="text-red-text" size={15} weight="fill" />;
}

function AttemptRow({ attempt, run }: Readonly<{ attempt: CheckAttempt; run: CheckRunRow }>) {
  const outcome =
    attempt.outcome === "ok" && typeof run.position === "number"
      ? `${formatAttemptOutcome(attempt)} · #${run.position}${
          typeof run.requestedDepth === "number" ? ` of top ${run.requestedDepth}` : ""
        }`
      : formatAttemptOutcome(attempt);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 text-[11.5px]">
      <AttemptTone attempt={attempt} />
      <span className="w-[clamp(76px,16vw,140px)] truncate font-semibold text-fg">
        {attempt.providerLabel}
      </span>
      <span className="flex min-w-[120px] flex-1 flex-wrap items-center gap-1.5 text-fg-muted">
        <span>{outcome}</span>
        {attempt.degradedToCountry ? <CountryLevelBadge /> : null}
      </span>
      <span className="font-mono text-[10.5px] text-fg-muted">
        {typeof attempt.costCents === "number" ? formatMoney(attempt.costCents) : "-"}
      </span>
      <span className="min-w-9 text-right font-mono text-[10.5px] text-fg-muted">
        {formatDuration(attempt.durationMs) ?? "-"}
      </span>
    </div>
  );
}

type HiddenMetaProps = {
  columns: RunTableColumns;
  now: Date;
  run: CheckRunRow;
};

function HiddenMeta({ columns, now, run }: Readonly<HiddenMetaProps>) {
  const items: ReactNode[] = [];
  if (!columns.depth) {
    items.push(
      <span key="depth">
        Depth · {typeof run.requestedDepth === "number" ? `Top ${run.requestedDepth}` : "-"}
      </span>,
    );
  }
  if (!columns.cost) {
    items.push(<span key="cost">Cost · {formatRunCost(run)}</span>);
  }
  if (!columns.when) {
    items.push(<span key="when">When · {formatWhen(run, now)}</span>);
  }
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10.5px] text-fg-muted">
      {items}
    </div>
  );
}

type DetailsProps = {
  columns: RunTableColumns;
  now: Date;
  run: CheckRunRow;
};

export function CheckRunDetails({ columns, now, run }: Readonly<DetailsProps>) {
  const duration =
    run.status === "failed" && run.error?.toLowerCase().includes("timed out")
      ? "timed out after 15 min"
      : formatDuration(run.durationMs);
  return (
    <div className="bg-bg-sunken px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10.5px] text-fg-muted">
        <strong className="font-semibold text-fg">
          {run.attempts.length > 0 ? "Provider chain" : "Run details"}
        </strong>
        {run.trigger ? <span className="capitalize">· {run.trigger}</span> : null}
        {duration ? <span>· {duration}</span> : null}
      </div>
      <HiddenMeta columns={columns} now={now} run={run} />
      {run.status === "failed" && run.error && isInternalErrorString(run.error) ? (
        <p
          className="mt-2 line-clamp-3 whitespace-pre-wrap break-words rounded-lg bg-bg-inset px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-fg-muted"
          title={run.error}
        >
          {run.error}
        </p>
      ) : null}
      {run.attempts.length > 0 ? (
        <div className="mt-2 divide-y divide-border-soft">
          {run.attempts.map((attempt, index) => (
            <AttemptRow attempt={attempt} key={`${attempt.provider}-${index}`} run={run} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
