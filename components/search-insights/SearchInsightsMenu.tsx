"use client";

import { cn } from "@/lib/ui/cn";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import type { ReactNode } from "react";

// Both context-bar dropdowns are listboxes over a short, known set, so they share one surface
// rather than each growing its own copy of the menu chrome.
const surfaceClass =
  "mt-1.5 rounded-card border border-border-control bg-bg-elev p-1.5 shadow-none";

const optionClass =
  "min-h-0 w-full gap-2.5 rounded-control px-2.5 py-2 text-left text-ui-body text-fg-muted hover:bg-bg-sunken focus:bg-bg-sunken aria-selected:bg-nav-active";
const selectedOptionClass = "rounded-control border border-border";

type SearchInsightsMenuProps = {
  anchorEl: HTMLElement | null;
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  /** The property list carries longer strings than the window list, so it opens wider. */
  wide?: boolean;
};

export function SearchInsightsMenu({
  anchorEl,
  ariaLabel,
  children,
  onClose,
  wide = false,
}: Readonly<SearchInsightsMenuProps>) {
  return (
    <Menu
      anchorEl={anchorEl}
      anchorOrigin={{ horizontal: "left", vertical: "bottom" }}
      onClose={onClose}
      open={Boolean(anchorEl)}
      transformOrigin={{ horizontal: "left", vertical: "top" }}
      slotProps={{
        list: { "aria-label": ariaLabel, className: "p-0", dense: true, role: "listbox" },
        paper: {
          className: cn(surfaceClass, wide ? "min-w-85" : "min-w-75"),
          sx: { minWidth: anchorEl?.getBoundingClientRect().width },
        },
      }}
    >
      {children}
    </Menu>
  );
}

type SearchInsightsMenuOptionProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onSelect?: () => void;
  selected: boolean;
};

export function SearchInsightsMenuOption({
  children,
  className,
  disabled = false,
  onSelect,
  selected,
}: Readonly<SearchInsightsMenuOptionProps>) {
  return (
    <MenuItem
      aria-disabled={disabled || undefined}
      aria-selected={selected}
      className={cn(
        optionClass,
        selected && selectedOptionClass,
        className,
        disabled && "cursor-not-allowed opacity-70",
      )}
      disableRipple={disabled}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
      }}
      role="option"
      sx={{ borderRadius: "var(--radius-control, 6px)" }}
    >
      {children}
    </MenuItem>
  );
}

type SearchInsightsMenuNoticeProps = {
  children: ReactNode;
};

export function SearchInsightsMenuSkeleton() {
  return (
    <li
      aria-label="Loading properties"
      className="flex h-8 w-full items-center gap-2.5 rounded-control border border-transparent px-2.5"
      role="status"
    >
      <span className="flex w-full items-center gap-2.5">
        <span className="h-[15px] w-[15px] shrink-0 animate-pulse rounded-full bg-bg-inset" />
        <span className="h-3 flex-1 animate-pulse rounded-full bg-bg-inset" />
        <span className="h-[19px] w-14 shrink-0 animate-pulse rounded-full border border-border bg-bg-sunken" />
      </span>
    </li>
  );
}

export function SearchInsightsMenuNotice({ children }: Readonly<SearchInsightsMenuNoticeProps>) {
  return (
    <p className="px-2.5 py-2 text-ui-caption text-fg-muted" role="status">
      {children}
    </p>
  );
}
