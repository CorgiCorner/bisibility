"use client";

import { DialogSurface as Drawer } from "@/components/ui/DialogSurface";
import { MOTION_DRAWER_ENTER, MOTION_DRAWER_EXIT } from "@/lib/ui/motion";
import { useMediaQuery } from "@/lib/ui/use-media-query";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { type DrawerBackAction, DrawerBackButton } from "./DrawerBackButton";

export type SheetHeightVariant = "form" | "filters";
export type SheetWidthVariant = "form" | "filters";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  backAction?: DrawerBackAction;
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
  backAction,
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
  const isDesktop = useMediaQuery("(min-width:1024px)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const titleId = useId();
  const anchor = isDesktop ? "right" : "bottom";
  const dataMode = heightVariant === "filters" ? "filters-drawer" : "form-sheet";
  const paperSlotProps: ComponentProps<"div"> & { "data-m": string; "data-open": string } = {
    "aria-labelledby": titleId,
    "data-m": dataMode,
    "data-open": open ? "true" : "false",
    role: "dialog",
    style: {
      backgroundColor: "var(--bg-elev)",
      borderColor: "var(--border)",
      borderLeft: isDesktop ? "1px solid var(--border)" : "none",
      borderRadius: isDesktop ? 0 : "18px 18px 0 0",
      borderTop: isDesktop ? "none" : "1px solid var(--border)",
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
      side={anchor}
      onClose={onClose}
      open={open}
      backdropProps={{ style: { backgroundColor: "rgba(20,16,8,.42)" } }}
      contentProps={paperSlotProps}
      onExited={onExited}
      duration={{
        enter: reducedMotion ? 0 : MOTION_DRAWER_ENTER,
        exit: reducedMotion ? 0 : MOTION_DRAWER_EXIT,
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-border bg-bg-elev px-6 py-5">
          <div className="flex min-w-0 items-center gap-2">
            {backAction ? <DrawerBackButton {...backAction} /> : null}
            <h2
              className="m-0 min-w-0 text-[18px] font-semibold leading-tight tracking-[-0.4px] text-fg"
              id={titleId}
            >
              {title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {headerAction}
            <button
              aria-label="Close sheet"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-fg-muted outline-none transition-[color,background-color,transform] duration-[var(--motion-press)] hover:bg-bg-sunken focus-visible:bg-bg-sunken motion-safe:active:not-focus-visible:scale-[0.97]"
              onClick={onClose}
              type="button"
            >
              <X aria-hidden size={18} weight="regular" />
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
