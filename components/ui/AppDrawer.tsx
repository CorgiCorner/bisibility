"use client";

import { DialogSurface as Drawer } from "@/components/ui/DialogSurface";
import { IconButton } from "@/components/ui/IconButton";
import { cn } from "@/lib/ui/cn";
import {
  FLOATING_DRAWER_DESKTOP_QUERY,
  FLOATING_DRAWER_FRAME_CLASS,
  FLOATING_DRAWER_PANEL_CLASS,
  FLOATING_DRAWER_SHEET_CLASS,
  FLOATING_DRAWER_WIDTH,
  type FloatingDrawerPlacement,
  floatingDrawerDuration,
  floatingDrawerPlacement,
} from "@/lib/ui/floating-drawer";
import { FloatingDrawerGrab } from "@/lib/ui/floating-drawer-grab";
import { useFloatingDrawerSwipe } from "@/lib/ui/use-floating-drawer-swipe";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import { useTranslations } from "next-intl";
import type { ComponentProps, ReactNode, Ref } from "react";
import { useId } from "react";
import { type DrawerBackAction, DrawerBackButton } from "./DrawerBackButton";

/** Why the panel is closing, so a caller can treat Escape differently from the close button. */
export type AppDrawerCloseReason = "backdropClick" | "escapeKeyDown";

export type AppDrawerProps = {
  open: boolean;
  onClose: (reason?: AppDrawerCloseReason) => void;
  /** Runs after the exit transition. Reset drawer state here, not in onClose: state cleared
      while the panel is still sliding out looks like the drawer never animated at all. */
  onExited?: () => void;
  title: ReactNode;
  backAction?: DrawerBackAction;
  /** Compact action rendered beside, but outside, the labelled title. */
  titleAction?: ReactNode;
  description?: string;
  /** Scroll container of the body, for a caller that restores an offset it recorded itself. */
  bodyRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  footer?: ReactNode;
  /** Above the title: a kicker, or the way back out of a stack of panels. */
  headerLeading?: ReactNode;
  /**
   * Accepted for existing callers. Placement follows the shared 640px rule for every drawer:
   * a floating panel from `sm` up, a bottom sheet below.
   */
  sheetOnMobile?: boolean;
  /** Puts the caret on the close button when the panel opens, for a panel opened from a row. */
  autoFocusClose?: boolean;
};

export function AppDrawer({
  backAction,
  autoFocusClose = false,
  bodyRef,
  open,
  onClose,
  onExited,
  title,
  titleAction,
  description,
  children,
  footer,
  headerLeading,
}: Readonly<AppDrawerProps>) {
  const t = useTranslations("shared.controls.drawer");
  const titleId = useId();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const isDesktop = useMediaQuery(FLOATING_DRAWER_DESKTOP_QUERY);
  const placement: FloatingDrawerPlacement = floatingDrawerPlacement(isDesktop);
  const sheet = placement === "sheet";
  const swipe = useFloatingDrawerSwipe({
    enabled: sheet,
    onClose: () => onClose(),
    reducedMotion,
  });
  const contentProps: ComponentProps<"div"> & { "data-placement": FloatingDrawerPlacement } = {
    "aria-labelledby": titleId,
    "aria-modal": true,
    className: cn(
      FLOATING_DRAWER_FRAME_CLASS,
      sheet ? FLOATING_DRAWER_SHEET_CLASS : FLOATING_DRAWER_PANEL_CLASS,
    ),
    "data-placement": placement,
    role: "dialog",
    style: sheet ? { maxHeight: "88vh", width: "auto" } : { width: FLOATING_DRAWER_WIDTH.form },
  };

  return (
    <Drawer
      side={sheet ? "bottom" : "right"}
      open={open}
      onClose={(_event, reason) => onClose(reason)}
      onExited={onExited}
      duration={floatingDrawerDuration(placement, reducedMotion)}
      contentProps={contentProps}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {sheet ? <FloatingDrawerGrab {...swipe} /> : null}
        <header
          className={cn(
            "flex items-start justify-between gap-4 border-b border-border px-5 py-4",
            sheet && "touch-none",
          )}
          {...(sheet ? swipe : undefined)}
        >
          <div className="min-w-0 flex-1">
            {headerLeading ? <div className="mb-1.25">{headerLeading}</div> : null}
            <div className="flex min-w-0 items-center gap-1.5">
              {backAction ? <DrawerBackButton {...backAction} /> : null}
              <h2
                className="m-0 min-w-0 truncate text-[18px] font-semibold leading-tight"
                id={titleId}
              >
                {title}
              </h2>
              {titleAction ? <div className="shrink-0">{titleAction}</div> : null}
            </div>
            {description ? (
              <p className="m-0 mt-1 text-[13px] leading-normal text-fg-muted">{description}</p>
            ) : null}
          </div>
          <IconButton
            aria-label={t("close")}
            className="shrink-0"
            autoFocus={autoFocusClose}
            onClick={() => onClose()}
            size="small"
          >
            <X size={18} weight="regular" />
          </IconButton>
        </header>
        {/* Focusable so a caller can put the caret back inside the panel after it swaps what the
            body shows, and so the scroll region can be reached from the keyboard at all. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5" ref={bodyRef} tabIndex={-1}>
          {children}
        </div>
        {footer ? <footer className="border-t border-border p-4">{footer}</footer> : null}
      </div>
    </Drawer>
  );
}
