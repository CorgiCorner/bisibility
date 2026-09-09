"use client";

import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import type { SearchSyncControlModel } from "@/lib/search-insights/sync/control-model";
import type React from "react";

export const SEARCH_SYNC_PAUSE_TOOLTIP =
  "Pausing longer than Google's 16-month window permanently loses the oldest unimported days.";

export function SearchSyncStatusControl({
  actionNode,
  busy = false,
  disabled = false,
  leadingActionNode,
  model,
  onAction,
  reconnectHref,
  suppressPauseTooltip = false,
  variant = "full",
}: Readonly<{
  actionNode?: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
  leadingActionNode?: React.ReactNode;
  model: SearchSyncControlModel;
  onAction?: () => void;
  reconnectHref?: string;
  suppressPauseTooltip?: boolean;
  variant?: "compact" | "full";
}>) {
  const baseAction =
    model.action === "reconnect" && reconnectHref ? (
      <Button
        className={variant === "full" ? "shrink-0" : undefined}
        href={reconnectHref}
        size="xs"
        variant={variant === "compact" ? "ghost" : "secondary"}
      >
        {model.actionLabel}
      </Button>
    ) : model.action ? (
      <Button
        aria-label={`${model.action === "resume" ? "Resume" : model.actionLabel} Search Console sync`}
        disabled={disabled}
        loading={busy}
        onClick={onAction}
        size="xs"
        type="button"
        variant={variant === "compact" ? "ghost" : "secondary"}
      >
        {model.actionLabel}
      </Button>
    ) : null;
  const candidate = actionNode ?? baseAction;
  const action =
    !suppressPauseTooltip && model.action === "pause" && candidate ? (
      <Tooltip content={SEARCH_SYNC_PAUSE_TOOLTIP}>{candidate}</Tooltip>
    ) : (
      candidate
    );
  return (
    <div
      className={
        variant === "compact"
          ? "inline-flex items-center gap-2"
          : "flex w-full items-center justify-between gap-3"
      }
    >
      <div>
        <p className="m-0 text-[12px] font-semibold text-fg">{model.status}</p>
        {model.supportingText ? (
          <p className="m-0 text-[11px] text-fg-muted">{model.supportingText}</p>
        ) : null}
      </div>
      {leadingActionNode || action ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {leadingActionNode}
          {action}
        </div>
      ) : null}
    </div>
  );
}
