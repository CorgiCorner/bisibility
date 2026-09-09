"use client";

import { useDeploymentMode } from "@/components/shell/DeploymentModeProvider";
import { OperationRow } from "@/components/ui/OperationRow";
import { Popup as Popover } from "@/components/ui/Popup";
import { quietChipVariants } from "@/components/ui/quiet-chip-styles";
import { useAppRealtime } from "@/lib/realtime/useAppRealtime";
import type { ProjectRef } from "@/lib/routing/app-path";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { cn } from "@/lib/ui/cn";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useEffect, useState } from "react";
import {
  isTrayOperation,
  labelForPill,
  operationPresentationFor,
  performOperationAction,
  type TrayOperation,
} from "./OperationsTrayModel";

export { operationPresentationFor } from "./OperationsTrayModel";

export const operationsTrayPopoverOrigins = {
  anchorOrigin: { horizontal: "right", vertical: "bottom" },
  transformOrigin: { horizontal: "right", vertical: "top" },
} as const;

export const operationsTrayPaperStyle = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: UI_RADIUS_ROLES.card,
  boxShadow: "none",
  color: "var(--fg)",
  marginTop: "8px",
  maxHeight: "calc(100dvh - 96px)",
  maxWidth: "calc(100vw - 32px)",
  overflow: "hidden",
  width: 420,
} as const;

export const operationsTrayPillClassName = cn(
  quietChipVariants({ size: "sm" }),
  "max-w-none flex-none gap-1.5 font-sans text-[10.5px] font-semibold leading-none tabular-nums text-fg transition-colors hover:border-border-control hover:bg-bg-inset",
);

const pillToneClassName = {
  accent: "bg-accent-solid",
  attention: "bg-yellow",
  critical: "bg-red",
  info: "bg-blue",
  neutral: "bg-fg-muted",
  planned: "bg-purple",
  positive: "bg-green",
} as const;

export function OperationsTray({
  defaultOpen = false,
  projectRef,
}: Readonly<{ defaultOpen?: boolean; projectRef: ProjectRef }>) {
  const { operations, status } = useAppRealtime();
  const deploymentMode = useDeploymentMode();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(defaultOpen);
  const [actionError, setActionError] = useState<string | null>(null);
  const trayOperations = operations
    .filter(isTrayOperation)
    .map((operation) => operationPresentationFor(operation, projectRef, deploymentMode));
  const pill = labelForPill(trayOperations);
  const runsHref = projectRunsPath(projectRef);
  const stale = status === "offline" || status === "reconnecting";

  // Synchronize the popup anchor with the realtime operation store when it drains.
  useEffect(() => {
    if (pill.kind === "idle") {
      setAnchorEl(null);
      setOpen(false);
    }
  }, [pill.kind]);

  function runAction(operation: TrayOperation) {
    setActionError(null);
    void performOperationAction(operation, projectRef).catch(() =>
      setActionError("Could not update this operation. Refresh and try again."),
    );
  }

  return (
    <>
      {pill.kind === "idle" ? (
        <a className={operationsTrayPillClassName} href={runsHref}>
          Runs
        </a>
      ) : (
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`${pill.count} ${pill.word} operations, open activity`}
          className={operationsTrayPillClassName}
          onClick={(event) => {
            setAnchorEl(event.currentTarget);
            setOpen(true);
          }}
          ref={setAnchorEl}
          title={`${pill.count} ${pill.word} operations`}
          type="button"
        >
          <span
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              pillToneClassName[pill.tone],
              pill.word === "running" &&
                "motion-safe:animate-[operations-pill-breathe_1.6s_ease-in-out_infinite]",
            )}
          />
          <span className="tabular-nums">{pill.count}</span>
          <span
            className={cn(
              "font-semibold",
              pill.tone === "critical"
                ? "text-red-text"
                : pill.tone === "attention"
                  ? "text-yellow-text"
                  : "text-fg",
            )}
          >
            {pill.word}
          </span>
        </button>
      )}
      <Popover
        anchorEl={anchorEl}
        align="end"
        side="bottom"
        aria-label="Activity"
        onClose={() => setOpen(false)}
        open={open}
        contentProps={{
          style: operationsTrayPaperStyle,
        }}
      >
        <div className="flex max-h-[calc(100dvh-96px)] flex-col">
          <header className="flex flex-none items-center justify-between gap-2.5 border-b border-border px-4 py-[13px]">
            <span className="text-sm font-semibold">Activity</span>
            <button
              aria-label="Close activity"
              className="grid h-9 w-9 place-items-center rounded-control bg-transparent p-0 text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X aria-hidden size={17} weight="regular" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {stale && trayOperations.length > 0 ? (
              <p
                className="m-0 border-b border-border px-4 py-2 text-xs text-fg-muted"
                role="status"
              >
                Live updates are unavailable. Showing the last known operations.
              </p>
            ) : null}
            {trayOperations.length > 0 ? (
              trayOperations.map((operation) => (
                <div className="border-b border-border last:border-b-0" key={operation.id}>
                  <OperationRow
                    {...operation}
                    onAction={operation.action ? () => runAction(operation) : undefined}
                    variant="modal"
                  />
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center gap-2.5 px-6 py-11 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-card bg-bg-sunken text-lg text-fg-muted">
                  ~
                </span>
                <span className="text-[13.5px] font-semibold">Nothing running</span>
                <p className="m-0 max-w-[340px] text-xs leading-[1.6] text-fg-muted">
                  No rank check or import is in flight. Finished rank checks keep their record in
                  Runs, imports in Search Console.
                </p>
              </div>
            )}
          </div>
          {actionError ? (
            <p className="m-0 border-t border-border px-4 py-3 text-xs text-red-text" role="alert">
              {actionError}
            </p>
          ) : null}
          <footer className="flex flex-none justify-end border-t border-border px-4 py-3">
            <a
              className="text-xs font-semibold text-fg-muted transition-colors hover:text-fg"
              href={runsHref}
            >
              View all runs
            </a>
          </footer>
        </div>
      </Popover>
      <style
        href="operations-pill-breathe"
        precedence="medium"
      >{`@keyframes operations-pill-breathe { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }`}</style>
    </>
  );
}
