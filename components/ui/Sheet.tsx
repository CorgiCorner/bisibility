"use client";

import { DialogSurface as Drawer } from "@/components/ui/DialogSurface";
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
import type { ComponentProps, ReactNode } from "react";
import { useId } from "react";
import { type DrawerBackAction, DrawerBackButton } from "./DrawerBackButton";

export type SheetHeightVariant = "form" | "filters";
export type SheetWidthVariant = "form" | "filters";

export type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Overrides the close control's accessible name for a named panel. */
  closeLabel?: string;
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

export function Sheet({
  backAction,
  children,
  closeLabel,
  footer,
  heightVariant = "form",
  headerAction,
  onClose,
  onExited,
  open,
  title,
  widthVariant,
}: Readonly<SheetProps>) {
  const t = useTranslations("shared.controls.sheet");
  const isDesktop = useMediaQuery(FLOATING_DRAWER_DESKTOP_QUERY);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const titleId = useId();
  const placement: FloatingDrawerPlacement = floatingDrawerPlacement(isDesktop);
  const sheet = placement === "sheet";
  const dataMode = heightVariant === "filters" ? "filters-drawer" : "form-sheet";
  const swipe = useFloatingDrawerSwipe({ enabled: sheet, onClose, reducedMotion });
  const paperSlotProps: ComponentProps<"div"> & {
    "data-m": string;
    "data-open": string;
    "data-placement": FloatingDrawerPlacement;
  } = {
    "aria-labelledby": titleId,
    className: cn(
      FLOATING_DRAWER_FRAME_CLASS,
      sheet ? FLOATING_DRAWER_SHEET_CLASS : FLOATING_DRAWER_PANEL_CLASS,
    ),
    "data-m": dataMode,
    "data-open": open ? "true" : "false",
    "data-placement": placement,
    role: "dialog",
    style: {
      height: sheet ? sheetHeights[heightVariant] : "auto",
      maxHeight: sheet ? sheetHeights[heightVariant] : "none",
      width: sheet ? "auto" : FLOATING_DRAWER_WIDTH[widthVariant ?? heightVariant],
    },
  };

  return (
    <Drawer
      side={sheet ? "bottom" : "right"}
      onClose={onClose}
      open={open}
      backdropProps={{ style: { backgroundColor: "rgba(20,16,8,.42)" } }}
      contentProps={paperSlotProps}
      onExited={onExited}
      duration={floatingDrawerDuration(placement, reducedMotion)}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {sheet ? <FloatingDrawerGrab {...swipe} /> : null}
        <header
          className={cn(
            "sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-border bg-bg-elev px-6 py-5",
            sheet && "touch-none",
          )}
          {...(sheet ? swipe : undefined)}
        >
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
              aria-label={closeLabel ?? t("close")}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-fg-muted outline-none transition-[color,background-color,transform] duration-[var(--motion-press)] hover:bg-bg-sunken focus-visible:bg-bg-sunken focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-accent-solid focus-visible:outline-offset-2 motion-reduce:transition-none motion-safe:active:not-focus-visible:scale-[0.97]"
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
