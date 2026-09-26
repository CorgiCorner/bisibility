"use client";

import { DialogSurface as Dialog } from "@/components/ui/DialogSurface";
import { headerIconButtonClassName } from "@/components/ui/header-icon-button-styles";
import { cn } from "@/lib/ui/cn";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { MOTION_MODAL_ENTER, MOTION_MODAL_EXIT } from "@/lib/ui/motion";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { cva } from "class-variance-authority";
import { useTranslations } from "next-intl";
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useId } from "react";

/** `full` fills the viewport inside the same 24px gutter the fixed sizes keep. */
export type ModalSize = "sm" | "md" | "lg" | "full";

export type ModalProps = {
  ariaLabelledBy?: string;
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  showClose?: boolean;
  headerDivider?: boolean;
  contentClassName?: string;
  footerClassName?: string;
  dismissDisabled?: boolean;
  initialFocus?: () => void;
  /** Exact panel width in px; overrides the `size` presets. */
  width?: number;
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
  onExited?: () => void;
};

const MODAL_GUTTER = "48px";
const modalWidth = {
  full: `calc(100vw - ${MODAL_GUTTER})`,
  lg: 640,
  md: 480,
  sm: 440,
} as const;

const contentVariants = cva("min-h-0 flex-1 overflow-y-auto px-5.5 py-4.5");

export function Modal({
  ariaLabelledBy,
  children,
  contentClassName,
  description,
  dismissDisabled = false,
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
  const t = useTranslations("shared.controls.modal");
  const titleId = useId();
  const descriptionId = useId();
  const hasHeader = title || description || showClose;
  const full = size === "full" && width === undefined;

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const composing = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
    if (composing) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!dismissDisabled) onClose();
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
    if (dismissDisabled) return;
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
      aria-describedby={description ? descriptionId : undefined}
      onClose={handleDialogClose}
      open={open}
      backdropProps={{ style: { backgroundColor: "rgba(20,16,8,.44)" } }}
      contentProps={{
        className: "rounded-card",
        onKeyDown: handleKeyDown,
        style: {
          borderRadius: UI_RADIUS_ROLES.card,
          backgroundColor: "var(--bg-elev)",
          border: "1px solid var(--border)",
          boxShadow: "none",
          color: "var(--fg)",
          ...(full ? { height: `calc(100dvh - ${MODAL_GUTTER})` } : {}),
          margin: 0,
          maxHeight: `calc(100dvh - ${MODAL_GUTTER})`,
          maxWidth: `calc(100% - ${MODAL_GUTTER})`,
          overflow: "hidden",
          width: width ?? modalWidth[size],
        },
      }}
      onEntered={initialFocus}
      onExited={onExited}
      duration={{ enter: MOTION_MODAL_ENTER, exit: MOTION_MODAL_EXIT }}
    >
      <div
        className={cn(
          "flex max-h-[calc(100dvh-48px)] min-h-0 flex-col overflow-hidden",
          // The panel's height is fixed, so the body takes what the header and footer leave.
          full && "flex-1",
        )}
        data-size={full ? "full" : undefined}
      >
        {hasHeader ? (
          <header
            className={cn(
              "sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 bg-bg-elev px-5.5 pt-5",
              headerDivider ? "border-b border-border py-4.5" : "pb-0",
            )}
          >
            <div className="min-w-0 flex-1">
              {title ? (
                <h2
                  className="m-0 min-w-0 text-wrap! text-[16.5px] font-semibold leading-tight tracking-[-0.3px] text-fg"
                  id={titleId}
                >
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p
                  className="m-0 mt-1.5 text-[13px] leading-normal text-fg-muted"
                  id={descriptionId}
                >
                  {description}
                </p>
              ) : null}
            </div>
            {showClose ? (
              <button
                aria-label={t("close")}
                className={headerIconButtonClassName}
                disabled={dismissDisabled}
                onClick={onClose}
                type="button"
              >
                <X aria-hidden size={17} weight="regular" />
              </button>
            ) : null}
          </header>
        ) : null}
        <div className={cn(contentVariants(), contentClassName)}>{children}</div>
        {footer ? (
          <footer
            className={cn(
              "sticky bottom-0 z-10 flex shrink-0 items-center justify-end gap-3 border-t border-border bg-bg-elev px-5.5 py-3.5",
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
