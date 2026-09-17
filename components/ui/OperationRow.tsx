"use client";

import { cn } from "@/lib/ui/cn";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import { useFormatter, useTranslations } from "next-intl";
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
export type OperationAction = "" | "cancel" | "pause" | "reconnect" | "retry" | "resume";

export type OperationRowProps = {
  action: OperationAction;
  /** A navigation action never calls an operation mutation. */
  actionHref?: string | null;
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
  unitKind?: "days";
  variant: OperationRowVariant;
};

type StateValues = {
  actor: string | null;
  eta: string | null;
  failed: number;
  hasActor: "no" | "yes";
  hasEta: "no" | "yes";
  hasResumeDate: "no" | "yes";
  provider: string | null;
  resumeDate: string | null;
};
type StateDefinition = { copy: (values: StateValues) => string; tone: string };

function etaUnit(etaSeconds: number | null) {
  if (etaSeconds === null || !Number.isFinite(etaSeconds) || etaSeconds < 0) return null;
  return etaSeconds < 60
    ? { count: Math.max(1, Math.round(etaSeconds)), unit: "seconds" as const }
    : { count: Math.max(1, Math.round(etaSeconds / 60)), unit: "minutes" as const };
}

function stateDefinitions(
  t: ReturnType<typeof useTranslations<"shared.operationRow">>,
): Record<OperationState, StateDefinition> {
  return {
    queued: { tone: "var(--accent)", copy: () => t("states.queued") },
    running: {
      tone: "var(--accent)",
      copy: ({ eta, hasEta, provider }) =>
        t("states.running", { eta: eta ?? "", hasEta, provider: provider ?? t("provider") }),
    },
    retrying: {
      tone: "var(--accent)",
      copy: ({ eta, hasEta }) => t("states.retrying", { eta: eta ?? "", hasEta }),
    },
    cancelling: { tone: "var(--fg-muted)", copy: () => t("states.cancelling") },
    worker: { tone: "var(--yellow)", copy: () => t("states.worker") },
    quota: {
      tone: "var(--yellow)",
      copy: ({ provider }) => t("states.quota", { provider: provider ?? t("provider") }),
    },
    deferred: { tone: "var(--yellow)", copy: () => t("states.deferred") },
    budget: {
      tone: "var(--yellow)",
      copy: ({ hasResumeDate, resumeDate }) =>
        t("states.budget", { hasResumeDate, resumeDate: resumeDate ?? "" }),
    },
    partial: { tone: "var(--yellow)", copy: ({ failed }) => t("states.partial", { failed }) },
    failed: {
      tone: "var(--red)",
      copy: ({ provider }) => t("states.failed", { provider: provider ?? t("provider") }),
    },
    succeeded: { tone: "var(--green)", copy: () => t("states.succeeded") },
    not_confirmed: { tone: "var(--fg-muted)", copy: () => t("states.notConfirmed") },
    cancelled: {
      tone: "var(--fg-muted)",
      copy: ({ actor, hasActor }) => t("states.cancelled", { actor: actor ?? "", hasActor }),
    },
  };
}

function actionDefinition(
  action: Exclude<OperationAction, "">,
  t: ReturnType<typeof useTranslations<"shared.operationRow">>,
) {
  return {
    cancel: { label: t("actions.cancel.label"), tip: t("actions.cancel.tip") },
    pause: { label: t("actions.pause.label"), tip: t("actions.pause.tip") },
    reconnect: { label: t("actions.reconnect.label"), tip: t("actions.reconnect.tip") },
    retry: { label: t("actions.retry.label"), tip: t("actions.retry.tip") },
    resume: { label: t("actions.resume.label"), tip: t("actions.resume.tip") },
  }[action];
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function countWithUnit(counts: string, unit: string): string {
  const value = counts.trim();
  return value.toLocaleLowerCase().includes(unit.toLocaleLowerCase()) ? value : `${value} ${unit}`;
}

function relativeFutureMessage(
  date: Date,
  now: Date,
  t: ReturnType<typeof useTranslations<"shared.operationRow">>,
) {
  const minutes = Math.ceil((date.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return t("relative.dueNow");
  if (minutes < 60) return t("relative.inMinutes", { count: minutes });
  const hours = Math.ceil(minutes / 60);
  return hours < 24
    ? t("relative.inHours", { count: hours })
    : t("relative.inDays", { count: Math.ceil(hours / 24) });
}

export function OperationRow(props: Readonly<OperationRowProps>) {
  const format = useFormatter();
  const t = useTranslations("shared.operationRow");
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
  const normalizedUnit =
    props.unitKind === "days"
      ? t("days", { count: Math.max(1, normalizedTotal) })
      : props.unit.trim() || t("items");
  const now = useLiveNow(
    props.now ?? props.nextCheckAt ?? "",
    Boolean(props.nextCheckAt && props.now),
  );
  const nextCheckAt = props.nextCheckAt ? new Date(props.nextCheckAt) : null;
  const nextCheckLine =
    (props.state === "running" || props.state === "queued") &&
    nextCheckAt &&
    props.now &&
    !Number.isNaN(nextCheckAt.getTime())
      ? t("nextCheck", {
          kind: props.state === "queued" ? t("nextCheckFirst") : t("nextCheckNext"),
          when: relativeFutureMessage(nextCheckAt, new Date(now), t),
        })
      : null;
  const definition = stateDefinitions(t)[props.state];
  const etaValue = etaUnit(props.etaSeconds);
  const eta = etaValue
    ? etaValue.unit === "seconds"
      ? t("etaSeconds", etaValue)
      : t("etaMinutes", etaValue)
    : null;
  const headline = props.meta ? `${props.title} · ${props.meta}` : props.title;
  const currentAction = props.action ? actionDefinition(props.action, t) : null;
  const countLabel = countWithUnit(
    props.counts?.trim() || `${format.number(processed)} / ${format.number(normalizedTotal)}`,
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
        {currentAction ? (
          <Button
            aria-label={`${currentAction.label} ${props.title}`}
            href={props.actionHref ?? undefined}
            onClick={props.actionHref ? undefined : props.onAction}
            size="xs"
            style={{
              "--control-hover-background-color": "var(--nav-active)",
              "--control-hover-color": "var(--fg)",
              "--control-border": "1px solid transparent",
              fontSize: "11.5px",
              lineHeight: 1.25,
              minHeight: "28px",
              minWidth: 0,
              padding: "4px 9px",
            }}
            title={currentAction.tip}
            variant="ghost"
          >
            {currentAction.label}
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
            aria-label={t("progress", {
              completed: normalizedCompleted,
              deferred: normalizedDeferred,
              failed: normalizedFailed,
              processed,
              title: props.title,
              total: normalizedTotal,
              unit: normalizedUnit,
            })}
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
            hasActor: props.actor ? "yes" : "no",
            hasEta: eta ? "yes" : "no",
            hasResumeDate: props.resumeDate ? "yes" : "no",
            provider: props.provider,
            resumeDate: props.resumeDate,
          })}
      </p>
    </div>
  );
}
