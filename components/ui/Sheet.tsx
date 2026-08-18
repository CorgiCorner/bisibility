"use client";

import { MOTION_DRAWER_ENTER, MOTION_DRAWER_EXIT } from "@/lib/ui/motion";
import Drawer from "@mui/material/Drawer";
import useMediaQuery from "@mui/material/useMediaQuery";
import { XIcon as X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useId } from "react";

export type SheetHeightVariant = "form" | "filters";
export type SheetWidthVariant = "form" | "filters";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  headerAction?: ReactNode;
  footer?: ReactNode;
  heightVariant?: SheetHeightVariant;
  widthVariant?: SheetWidthVariant;
  children: ReactNode;
  onExited?: () => void;
};

const sheetHeights: Record<SheetHeightVariant, string> = {
  filters: "88vh",
  form: "96vh",
};

const sheetWidths: Record<SheetWidthVariant, number> = {
  filters: 440,
  form: 560,
};

export function Sheet({
  children,
  footer,
  heightVariant = "form",
  headerAction,
  onClose,
  onExited,
  open,
  title,
  widthVariant,
}: Readonly<SheetProps>) {
  const isDesktop = useMediaQuery("(min-width:1024px)", { noSsr: true });
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true });
  const titleId = useId();
  const anchor = isDesktop ? "right" : "bottom";
  const dataMode = heightVariant === "filters" ? "filters-drawer" : "form-sheet";
  const paperSlotProps = {
    "aria-labelledby": titleId,
    "data-m": dataMode,
    "data-open": open ? "true" : "false",
    role: "dialog",
    sx: {
      // Use the same 1024px breakpoint for anchor and dimensions; MUI lg defaults to
      // 1200px and misstyles widths from 1024-1199px.
      backgroundColor: "var(--bg-elev)",
      borderColor: "var(--border-strong)",
      borderLeft: isDesktop ? "1px solid var(--border-strong)" : "none",
      borderRadius: isDesktop ? 0 : "18px 18px 0 0",
      borderTop: isDesktop ? "none" : "1px solid var(--border-strong)",
      boxShadow: "none",
      color: "var(--fg)",
      display: "flex",
      flexDirection: "column",
      height: isDesktop ? "100%" : sheetHeights[heightVariant],
      maxHeight: isDesktop ? "100%" : sheetHeights[heightVariant],
      maxWidth: isDesktop ? "94vw" : "100%",
      overflow: "hidden",
      width: isDesktop ? sheetWidths[widthVariant ?? heightVariant] : "100%",
      willChange: "transform",
    },
  };

  return (
    <Drawer
      anchor={anchor}
      onClose={onClose}
      open={open}
      slotProps={{
        backdrop: { sx: { backgroundColor: "rgba(20,16,8,.42)" } },
        paper: paperSlotProps,
        transition: {
          ...(onExited ? { onExited } : {}),
          ...(reducedMotion ? { timeout: 0 } : {}),
        },
      }}
      transitionDuration={{ enter: MOTION_DRAWER_ENTER, exit: MOTION_DRAWER_EXIT }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-border bg-bg-elev px-6 py-5">
          <h2
            className="m-0 min-w-0 text-[18px] font-semibold leading-tight tracking-[-0.4px] text-fg"
            id={titleId}
          >
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            {headerAction}
            <button
              aria-label="Close sheet"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-muted outline-none transition-[color,background-color,transform] duration-[var(--motion-press)] hover:bg-bg-sunken focus-visible:bg-bg-sunken motion-safe:active:not-focus-visible:scale-[0.97]"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden size={18} weight="bold" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5.5">{children}</div>
        {footer ? (
          <footer className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-bg-elev px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </Drawer>
  );
}
