"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui/cn";
import { XIcon as X } from "@phosphor-icons/react/dist/csr/X";
import type { ReactNode } from "react";
import styles from "./FloatingSelectionBar.module.css";

/**
 * Room a page reserves below its last row while the bar is visible, so the bar never covers
 * content at the end of the scroll. It covers the one-row bar plus its bottom offset; a page
 * adds it only while something is selected, without measuring the bar.
 */
export const FLOATING_SELECTION_BAR_SPACE = "calc(72px + env(safe-area-inset-bottom, 0px))";

type FloatingSelectionBarProps = {
  ariaLabel: string;
  children: ReactNode;
  clearLabel: string;
  count: number;
  /** Already localized, for example "3 selected". */
  countLabel: string;
  /** Optional line under the actions, for example an inline error. */
  footer?: ReactNode;
  onClear: () => void;
};

/**
 * Selection actions docked at the bottom of the content area while rows are selected. The bar is
 * fixed, so showing or hiding it never moves the page. It sits above sticky table chrome
 * (`z-10`/`z-20`) and the shell header, and below menus, dialogs, tooltips and toasts
 * (`z-1300`+). The left edge follows `--app-sidebar-width` when the shell provides it.
 */
export function FloatingSelectionBar({
  ariaLabel,
  children,
  clearLabel,
  count,
  countLabel,
  footer,
  onClear,
}: Readonly<FloatingSelectionBarProps>) {
  const visible = count > 0;

  return (
    <>
      {/* Mounted before the bar appears, so the first count change is announced too. */}
      <span aria-live="polite" className="sr-only" role="status">
        {visible ? countLabel : ""}
      </span>
      {visible ? (
        <div
          className="pointer-events-none fixed right-0 bottom-0 left-[var(--app-sidebar-width,0px)] z-30 flex justify-center px-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] sm:px-4 sm:pb-[calc(16px+env(safe-area-inset-bottom,0px))]"
          data-floating-selection-bar=""
        >
          <div
            aria-label={ariaLabel}
            aria-orientation="horizontal"
            className={cn(
              styles.bar,
              "pointer-events-auto grid w-full max-w-[960px] min-w-0 gap-1 rounded-card border border-border bg-bg-elev px-2 py-1.5 text-fg sm:px-3 sm:py-2",
            )}
            role="toolbar"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 whitespace-nowrap pl-1 font-sans text-[12.5px] font-semibold tabular-nums text-fg">
                {countLabel}
              </span>
              <div
                className={cn(
                  styles.actions,
                  "flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto py-0.5 *:shrink-0 [&_button]:whitespace-nowrap",
                )}
                data-floating-selection-actions=""
              >
                {children}
              </div>
              <Button
                className="shrink-0"
                onClick={onClear}
                size="xs"
                startIcon={<X aria-hidden size={14} weight="regular" />}
                variant="ghost"
              >
                <span className="max-sm:sr-only">{clearLabel}</span>
              </Button>
            </div>
            {footer ? <div className="min-w-0 px-1">{footer}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** In-flow space matching {@link FLOATING_SELECTION_BAR_SPACE}; render it only while visible. */
export function FloatingSelectionBarSpacer() {
  return (
    <div
      aria-hidden="true"
      data-floating-selection-spacer=""
      style={{ height: FLOATING_SELECTION_BAR_SPACE }}
    />
  );
}
