"use client";

import { cn } from "@/lib/ui/cn";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { MOTION_MODAL_ENTER, MOTION_MODAL_EXIT } from "@/lib/ui/motion";
import Dialog from "@mui/material/Dialog";
import { XIcon as X } from "@phosphor-icons/react";
import { cva } from "class-variance-authority";
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useId } from "react";

export type ModalSize = "sm" | "md" | "lg";

export type ModalProps = {
  ariaLabelledBy?: string;
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  showClose?: boolean;
  headerDivider?: boolean;
  contentClassName?: string;
  footerClassName?: string;
  initialFocus?: () => void;
  /** Exact panel width in px; overrides the `size` presets. */
  width?: number;
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
  onExited?: () => void;
};

const modalWidth = {
  lg: 640,
  md: 480,
  sm: 440,
} as const;

const contentVariants = cva("min-h-0 flex-1 overflow-y-auto px-5.5 py-4.5");

export function Modal({
  ariaLabelledBy,
  children,
  contentClassName,
  footer,
  footerClassName,
  headerDivider = false,
  initialFocus,
  onClose,
  onExited,
  onPrimaryAction,
  open,
  primaryActionDisabled = false,
  showClose = true,
  size = "md",
  title,
  width,
}: Readonly<ModalProps>) {
  const titleId = useId();
  const hasHeader = title || showClose;

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const composing = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
    if (composing) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      if (onPrimaryAction && !primaryActionDisabled) {
        onPrimaryAction();
      }
    }
  }

  function handleDialogClose(event: object, reason: "backdropClick" | "escapeKeyDown") {
    if (reason === "escapeKeyDown") {
      const native = (event as { nativeEvent?: { isComposing?: boolean; keyCode?: number } })
        .nativeEvent;
      if (native?.isComposing || native?.keyCode === 229) return;
    }
    onClose();
  }

  return (
    <Dialog
      aria-labelledby={title ? titleId : ariaLabelledBy}
      onClose={handleDialogClose}
      open={open}
      slotProps={{
        backdrop: { sx: { backgroundColor: "rgba(20,16,8,.44)" } },
        paper: {
          className: "rounded-card-lg",
          onKeyDown: handleKeyDown,
          sx: {
            "&.rounded-card-lg": { borderRadius: UI_RADIUS_ROLES["card-lg"] },
            backgroundColor: "var(--bg-elev)",
            border: "1px solid var(--border-strong)",
            boxShadow: "none",
            color: "var(--fg)",
            margin: "24px",
            maxHeight: "calc(100dvh - 48px)",
            maxWidth: "calc(100% - 48px)",
            overflow: "hidden",
            width: width ?? modalWidth[size],
          },
        },
        transition: {
          ...(initialFocus ? { onEntered: initialFocus } : {}),
          ...(onExited ? { onExited } : {}),
        },
      }}
      transitionDuration={{ enter: MOTION_MODAL_ENTER, exit: MOTION_MODAL_EXIT }}
    >
      <div className="flex max-h-[calc(100dvh-48px)] min-h-0 flex-col overflow-hidden">
        {hasHeader ? (
          <header
            className={cn(
              "sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 bg-bg-elev px-5.5 pt-5",
              headerDivider ? "border-b border-border py-4.5" : "pb-0",
            )}
          >
            {title ? (
              <h2
                className="m-0 min-w-0 text-[16.5px] font-semibold leading-tight tracking-[-0.3px] text-fg"
                id={titleId}
              >
                {title}
              </h2>
            ) : (
              <span />
            )}
            {showClose ? (
              <button
                aria-label="Close modal"
                className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg text-fg-muted outline-none transition-[color,background-color,transform] duration-[var(--motion-press)] hover:bg-bg-sunken focus-visible:bg-bg-sunken motion-safe:active:not-focus-visible:scale-[0.97]"
                onClick={onClose}
                type="button"
              >
                <X aria-hidden size={17} weight="bold" />
              </button>
            ) : null}
          </header>
        ) : null}
        <div className={cn(contentVariants(), contentClassName)}>{children}</div>
        {footer ? (
          <footer
            className={cn(
              "sticky bottom-0 z-10 flex shrink-0 items-center justify-end gap-4.5 border-t border-border bg-bg-elev px-5.5 py-3.5",
              footerClassName,
            )}
          >
            {footer}
          </footer>
        ) : null}
      </div>
    </Dialog>
  );
}
