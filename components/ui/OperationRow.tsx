"use client";

import { relativeFuture } from "@/lib/format/relative-time";
import { cn } from "@/lib/ui/cn";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react";
import { Button } from "./Button";
import { StatusChip } from "./StatusChip";
import type { StatusChipPresentation } from "./status-chip-mapping";
import { useLiveNow } from "./useLiveNow";

export type OperationRowVariant = "modal" | "inline" | "compact";
export type OperationState =
  | "queued"
  | "running"
  | "retrying"
  | "cancelling"
  | "worker"
  | "quota"
  | "deferred"
  | "budget"
  | "partial"
  | "failed"
  | "succeeded"
  | "not_confirmed"
  | "cancelled";
export type OperationAction = "" | "cancel" | "pause" | "retry" | "resume";

export type OperationRowProps = {
  action: OperationAction;
  actor: string | null;
  completed: number;
  counts: string | null;
  deferred: number;
  etaSeconds: number | null;
  failed: number;
  href: string | null;
  meta: string | null;
  nextCheckAt: string | null;
  now: string | null;
  onAction?: () => void;
  provider: string | null;
  resumeDate: string | null;
  showBar: boolean;
  state: OperationState;
  stateLine: string | null;
  status: StatusChipPresentation | null;
  title: string;
  total: number;
  unit: string;
  variant: OperationRowVariant;
};

type StateValues = {
  actor: string | null;
  eta: string | null;
  failed: number;
  provider: string | null;
  resumeDate: string | null;
};
type StateDefinition = { copy: (values: StateValues) => string; tone: string };

export function formatEtaSeconds(etaSeconds: number | null): string | null {
  if (etaSeconds === null || !Number.isFinite(etaSeconds) || etaSeconds < 0) return null;
  if (etaSeconds < 60) return `~${Math.max(1, Math.round(etaSeconds))} s left`;
  return `~${Math.max(1, Math.round(etaSeconds / 60))} min left`;
}

const STATE_DEFINITIONS = {
  queued: {
    tone: "var(--accent)",
    copy: () => "Waiting for the first check to start.",
  },
  running: {
    tone: "var(--accent)",
    copy: ({ eta, provider }) =>
      `${provider ?? "The provider"} is returning results${eta ? ` - ${eta}` : ""}.`,
  },
  retrying: {
    tone: "var(--accent)",
    copy: ({ eta }) => `Retrying failed checks${eta ? ` - ${eta}` : ""}.`,
  },
  cancelling: {
    tone: "var(--fg-muted)",
    copy: () => "Cancelling - checks already sent to the provider will still finish.",
  },
  worker: {
    tone: "var(--yellow)",
    copy: () => "Waiting for the import worker to pick this up - it polls every 60 seconds.",
  },
  quota: {
    tone: "var(--yellow)",
    copy: ({ provider }) =>
      `${provider ?? "Provider"} quota reached for today - the import resumes at 00:00 UTC.`,
  },
  deferred: {
    tone: "var(--yellow)",
    copy: () => "Deferred by provider rate limits - they retry on the next scheduled run.",
  },
  budget: {
    tone: "var(--yellow)",
    copy: ({ resumeDate }) =>
      resumeDate
        ? `Monthly cap reached - the rest is skipped until ${resumeDate}.`
        : "Monthly cap reached - remaining items are skipped.",
  },
  partial: {
    tone: "var(--yellow)",
    copy: ({ failed }) =>
      `Finished with ${failed.toLocaleString("en-US")} failures - a retry sends those and nothing else.`,
  },
  failed: {
    tone: "var(--red)",
    copy: ({ provider }) =>
      `Nothing completed - ${provider ?? "the provider"} rejected every request.`,
  },
  succeeded: { tone: "var(--green)", copy: () => "Every item completed." },
  not_confirmed: {
    tone: "var(--fg-muted)",
    copy: () => "The run finished, but its outcome was not confirmed.",
  },
  cancelled: {
    tone: "var(--fg-muted)",
    copy: ({ actor }) =>
      actor
        ? `Cancelled by ${actor} - what completed first is kept.`
        : "Cancelled - what completed first is kept.",
  },
} satisfies Record<OperationState, StateDefinition>;

const ACTIONS = {
  cancel: {
    label: "Cancel",
    tip: "Stops checks that have not been sent yet. Checks already with the provider finish and are billed.",
  },
  pause: {
    label: "Pause",
    tip: "Pauses the import after the current month. Nothing already imported is discarded.",
  },
  retry: { label: "Retry", tip: "Opens the preflight scoped to the failed checks only." },
  resume: { label: "Resume", tip: "Hands the import back to the worker queue." },
} as const satisfies Record<Exclude<OperationAction, "">, { label: string; tip: string }>;

const numberFormatter = new Intl.NumberFormat("en-US");

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function countWithUnit(counts: string, unit: string): string {
  const value = counts.trim();
  return value.toLocaleLowerCase().includes(unit.toLocaleLowerCase()) ? value : `${value} ${unit}`;
}

export function OperationRow(props: Readonly<OperationRowProps>) {
  const normalizedTotal = nonNegativeInteger(props.total);
  const normalizedCompleted = Math.min(nonNegativeInteger(props.completed), normalizedTotal);
  const normalizedFailed = Math.min(
    nonNegativeInteger(props.failed),
    normalizedTotal - normalizedCompleted,
  );
  const normalizedDeferred = Math.min(
    nonNegativeInteger(props.deferred),
    normalizedTotal - normalizedCompleted - normalizedFailed,
  );
  const processed = normalizedCompleted + normalizedFailed + normalizedDeferred;
  const normalizedUnit = props.unit.trim() || "items";
  const now = useLiveNow(
    props.now ?? props.nextCheckAt ?? "",
    Boolean(props.nextCheckAt && props.now),
  );
  const nextCheckLine =
    (props.state === "running" || props.state === "queued") && props.nextCheckAt && props.now
      ? `${props.state === "queued" ? "First" : "Next"} check ${relativeFuture(new Date(props.nextCheckAt), new Date(now))}`
      : null;
  const definition = STATE_DEFINITIONS[props.state];
  const eta = formatEtaSeconds(props.etaSeconds);
  const headline = props.meta ? `${props.title} · ${props.meta}` : props.title;
  const actionDefinition = props.action ? ACTIONS[props.action] : null;
  const countLabel = countWithUnit(
    props.counts?.trim() ||
      `${numberFormatter.format(processed)} / ${numberFormatter.format(normalizedTotal)}`,
    normalizedUnit,
  );
  const width = (value: number) =>
    normalizedTotal > 0 ? `${(value / normalizedTotal) * 100}%` : "0%";

  return (
    <div
      className={cn(
        "group/oprow flex w-full min-w-0 flex-col gap-2 font-sans text-fg antialiased",
        props.variant === "modal"
          ? "rounded-none border-0 bg-transparent px-4 py-[13px]"
          : "rounded-card border border-border bg-bg-elev p-3.5",
      )}
      data-operation-row
      data-operation-state={props.state}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {props.href ? (
          <a
            className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold leading-[1.35] text-fg no-underline transition-colors duration-[160ms] hover:text-accent-text"
            href={props.href}
          >
            {headline}
          </a>
        ) : (
          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-semibold leading-[1.35]">
            {headline}
          </span>
        )}
        {props.status ? <StatusChip {...props.status} /> : null}
        {actionDefinition ? (
          <Button
            aria-label={`${actionDefinition.label} ${props.title}`}
            onClick={props.onAction}
            size="xs"
            sx={{
              "&:hover": { backgroundColor: "var(--nav-active)", color: "var(--fg)" },
              border: "1px solid transparent",
              fontSize: "11.5px",
              lineHeight: 1.25,
              minHeight: "28px",
              minWidth: 0,
              padding: "4px 9px",
            }}
            title={actionDefinition.tip}
            variant="ghost"
          >
            {actionDefinition.label}
          </Button>
        ) : null}
        {props.href ? (
          <CaretRight
            aria-hidden
            className="shrink-0 text-fg-muted transition-colors duration-[160ms] group-hover/oprow:text-fg"
            data-testid="operation-row-chevron"
            size={11}
            weight="regular"
          />
        ) : null}
      </div>
      {props.showBar && normalizedTotal > 0 ? (
        <div className="flex min-w-0 items-center gap-4">
          <div
            aria-label={`${props.title}: ${processed} of ${normalizedTotal} ${normalizedUnit} processed, ${normalizedCompleted} completed, ${normalizedFailed} failed, ${normalizedDeferred} deferred`}
            aria-valuemax={normalizedTotal}
            aria-valuemin={0}
            aria-valuenow={processed}
            className="flex h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-meter-track"
            role="progressbar"
          >
            <span
              className="h-full transition-[width] duration-300 ease-[ease] motion-reduce:transition-none"
              data-operation-fill="completed"
              style={{ backgroundColor: definition.tone, width: width(normalizedCompleted) }}
            />
            <span
              className="h-full bg-red transition-[width] duration-300 ease-[ease] motion-reduce:transition-none"
              data-operation-fill="failed"
              style={{ width: width(normalizedFailed) }}
            />
            <span
              className="h-full bg-yellow transition-[width] duration-300 ease-[ease] motion-reduce:transition-none"
              data-operation-fill="deferred"
              style={{ width: width(normalizedDeferred) }}
            />
          </div>
          <span className="shrink-0 whitespace-nowrap text-[11px] font-medium tabular-nums text-fg-muted">
            {countLabel}
          </span>
        </div>
      ) : null}
      <p className="m-0 text-pretty text-xs leading-[1.5] text-fg">
        {props.stateLine ||
          nextCheckLine ||
          definition.copy({
            actor: props.actor,
            eta,
            failed: normalizedFailed,
            provider: props.provider,
            resumeDate: props.resumeDate,
          })}
      </p>
    </div>
  );
}
