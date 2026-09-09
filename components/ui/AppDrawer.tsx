"use client";

import { DialogSurface as Drawer } from "@/components/ui/DialogSurface";
import { IconButton } from "@/components/ui/IconButton";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { MOTION_DRAWER_ENTER, MOTION_DRAWER_EXIT } from "@/lib/ui/motion";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import type { ReactNode, Ref } from "react";
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
  /** On a phone the side panel becomes a bottom sheet, which is where a thumb reaches. */
  sheetOnMobile?: boolean;
  /** Puts the caret on the close button when the panel opens, for a panel opened from a row. */
  autoFocusClose?: boolean;
};

const panelBorder = "1px solid var(--border)";

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
  sheetOnMobile = false,
}: Readonly<AppDrawerProps>) {
  const titleId = useId();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const narrow = useMediaQuery("(max-width:640px)");
  const sheet = sheetOnMobile && narrow;

  return (
    <Drawer
      side={sheet ? "bottom" : "right"}
      open={open}
      onClose={(_event, reason) => onClose(reason)}
      onExited={onExited}
      duration={{
        enter: reducedMotion ? 0 : MOTION_DRAWER_ENTER,
        exit: reducedMotion ? 0 : MOTION_DRAWER_EXIT,
      }}
      contentProps={{
        "aria-labelledby": titleId,
        "aria-modal": true,
        role: "dialog",
        style: {
          backgroundColor: "var(--bg-elev)",
          boxShadow: "none",
          color: "var(--fg)",
          ...(sheet
            ? {
                borderTop: panelBorder,
                borderTopLeftRadius: UI_RADIUS_ROLES.card,
                borderTopRightRadius: UI_RADIUS_ROLES.card,
                maxHeight: "88vh",
                maxWidth: "100%",
                width: "100%",
              }
            : { borderLeft: panelBorder, maxWidth: "94vw", width: 560 }),
        },
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
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
            aria-label="Close drawer"
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
