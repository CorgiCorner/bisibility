"use client";
import { IconButton } from "@/components/ui/IconButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { Button } from "@/components/usagekit/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/usagekit/primitives/card";
import {
  ProviderReadFeedback,
  providerFeedbackLabels,
} from "@/components/usagekit/provider-feedback";
import type {
  ProjectChainProps,
  ProviderChainLabels,
} from "@/components/usagekit/provider-project-controller";
import { useProjectChainController } from "@/components/usagekit/provider-project-controller";
import { retainMovedRowFocus } from "@/components/usagekit/usage-motion";
import { ArrowDownIcon } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpIcon } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { PauseIcon } from "@phosphor-icons/react/dist/csr/Pause";
import { PlayIcon } from "@phosphor-icons/react/dist/csr/Play";

export type {
  ProjectChainCommand,
  ProjectChainEntry,
  ProjectChainProps,
  ProjectChainResult,
  ProjectChainSnapshot,
} from "@/components/usagekit/provider-project-controller";
export { useProjectChainController } from "@/components/usagekit/provider-project-controller";
export function ProjectChainEditor(props: ProjectChainProps & { labels: ProviderChainLabels }) {
  const state = useProjectChainController(props);
  const labels = props.labels;
  const feedback = { ...providerFeedbackLabels, ...props.feedbackLabels };
  if (!state.draft.length && !state.pending && !state.ambiguous)
    return (
      <ProviderReadFeedback
        state="empty"
        labels={props.feedbackLabels}
        refresh={() => void state.reload()}
      />
    );
  const Surface = props.variant === "plain" ? "div" : Card;
  const showControls = props.showControls !== false;
  const changed = JSON.stringify(state.draft) !== JSON.stringify(state.base.entries);
  const move = (i: number, delta: number) => {
    const rows = [...state.draft];
    const other = i + delta;
    const current = rows[i];
    const neighbor = rows[other];
    if (!current || !neighbor || neighbor.enabled !== current.enabled) return;
    [rows[i], rows[other]] = [neighbor, current];
    state.change(rows);
  };
  const outcome = state.result?.outcome ?? state.notice;
  const message = state.ambiguous
    ? feedback.unknown
    : outcome === "conflict"
      ? feedback.conflict
      : outcome === "forbidden"
        ? feedback.forbidden
        : outcome === "success"
          ? feedback.success
          : outcome === "unavailable"
            ? feedback.unavailable
            : outcome === "not_applied"
              ? feedback.notApplied
              : outcome === "invalid"
                ? labels.invalid
                : null;
  return (
    <Surface className="min-w-0" aria-busy={state.pending || undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{labels.title}</CardTitle>
          <span className="text-xs tabular-nums text-fg-muted">
            {props.formatCount?.(state.draft.filter((row) => row.enabled).length)}
          </span>
        </div>
        <CardDescription>{labels.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ol
          aria-label={labels.title}
          className="m-0 list-none divide-y divide-border rounded-control border border-border p-0"
        >
          {state.draft.map((row, i) => (
            <li
              key={row.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_7rem_auto]"
            >
              <span
                aria-hidden
                className="hidden text-center text-xs tabular-nums text-fg-muted sm:block"
              >
                {i + 1}
              </span>
              <span className="col-start-1 row-start-1 min-w-0 break-words text-sm font-medium sm:col-start-2">
                {row.label}
              </span>
              <span className="col-start-1 row-start-2 text-xs text-fg-muted sm:col-start-3 sm:row-start-1 sm:text-end">
                {row.enabled ? (i === 0 ? labels.first : labels.next) : labels.paused}
                {props.formatPosition?.(row, i, state.draft.length)}
              </span>
              {showControls && (
                <div className="col-start-2 row-span-2 row-start-1 flex items-center gap-1 sm:col-start-4 sm:row-span-1">
                  <Tooltip content={labels.up}>
                    <IconButton
                      type="button"
                      size="small"
                      className="min-h-10 min-w-10 sm:min-h-7 sm:min-w-7"
                      aria-label={`${labels.up}: ${row.label}`}
                      disabled={
                        !state.editable || i === 0 || state.draft[i - 1]?.enabled !== row.enabled
                      }
                      onClick={(event) => {
                        move(i, -1);
                        retainMovedRowFocus(event.currentTarget);
                      }}
                    >
                      <ArrowUpIcon aria-hidden size={16} weight="regular" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content={labels.down}>
                    <IconButton
                      type="button"
                      size="small"
                      className="min-h-10 min-w-10 sm:min-h-7 sm:min-w-7"
                      aria-label={`${labels.down}: ${row.label}`}
                      disabled={
                        !state.editable ||
                        i === state.draft.length - 1 ||
                        state.draft[i + 1]?.enabled !== row.enabled
                      }
                      onClick={(event) => {
                        move(i, 1);
                        retainMovedRowFocus(event.currentTarget);
                      }}
                    >
                      <ArrowDownIcon aria-hidden size={16} weight="regular" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip content={row.enabled ? labels.disable : labels.enable}>
                    <IconButton
                      type="button"
                      size="small"
                      className="min-h-10 min-w-10 sm:min-h-7 sm:min-w-7"
                      aria-label={`${row.enabled ? labels.disable : labels.enable}: ${row.label}`}
                      disabled={!state.editable}
                      onClick={() => {
                        const rows = state.draft.map((r) =>
                          r.id === row.id ? { ...r, enabled: !r.enabled } : r,
                        );
                        state.change([
                          ...rows.filter((r) => r.enabled),
                          ...rows.filter((r) => !r.enabled),
                        ]);
                      }}
                    >
                      {row.enabled ? (
                        <PauseIcon aria-hidden size={16} weight="regular" />
                      ) : (
                        <PlayIcon aria-hidden size={16} weight="regular" />
                      )}
                    </IconButton>
                  </Tooltip>
                </div>
              )}
            </li>
          ))}
        </ol>
        {showControls && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!state.editable || !changed}
              onClick={() => void state.save()}
            >
              {labels.save}
            </Button>
            {props.onReload && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={state.pending || state.ambiguous}
                onClick={() => void state.reload()}
              >
                {labels.reload}
              </Button>
            )}
          </div>
        )}
        {state.pending ? (
          <p role="status">{feedback.pending}</p>
        ) : (
          message && <p role="status">{message}</p>
        )}
        {state.ambiguous && props.onReconcile && (
          <Button type="button" disabled={state.pending} onClick={() => void state.reconcile()}>
            {feedback.reconcile}
          </Button>
        )}
      </CardContent>
    </Surface>
  );
}
