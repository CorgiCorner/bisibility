"use client";

import { cn } from "@/lib/ui/cn";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { CaretDownIcon as CaretDown, CheckIcon as Check } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { MenuSelectOptionItem, menuSelectRowSx } from "./MenuSelectOptionItem";
import { toolbarControlClassName } from "./toolbar-control-styles";

export type MenuSelectOption = {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  secondary?: string;
  tooltip?: string;
  value: string;
};

export type MenuSelectProps = {
  ariaLabel: string;
  /** Optional leading "pre-icon" rendered inside the trigger, before the value. */
  leadingIcon?: ReactNode;
  onChange: (value: string) => void;
  options: readonly MenuSelectOption[];
  searchPlaceholder?: string;
  searchable?: boolean;
  triggerClassName?: string;
  value: string;
};

export type MenuMultiSelectProps = {
  ariaLabel: string;
  leadingIcon?: ReactNode;
  minSelected?: number;
  onChange: (values: string[]) => void;
  options: readonly MenuSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  summary?: (selected: readonly MenuSelectOption[]) => string;
  triggerClassName?: string;
  values: readonly string[];
};

export const menuSelectPaperSx = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  boxShadow: "none",
  color: "var(--fg)",
  marginTop: "6px",
  minWidth: 180,
  padding: "6px",
} as const;

const triggerClass = cn(
  toolbarControlClassName,
  "inline-flex items-center gap-1.5 px-[11px] outline-none transition-colors hover:border-accent focus-visible:border-accent focus-visible:outline-none",
);

function selectedSummary(
  selected: readonly MenuSelectOption[],
  placeholder: string,
  summary?: (selected: readonly MenuSelectOption[]) => string,
) {
  if (summary) {
    return summary(selected);
  }
  if (selected.length === 0) {
    return placeholder;
  }
  if (selected.length <= 2) {
    return selected.map((option) => option.label).join(", ");
  }
  return `${selected.length} selected`;
}

type MenuSearchFieldProps = {
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

function MenuSearchField({ onChange, placeholder, value }: Readonly<MenuSearchFieldProps>) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="px-1 pb-1">
      <input
        aria-label={placeholder}
        className="min-h-8 w-full rounded-[8px] border border-border-strong bg-transparent px-2.5 text-[12.5px] text-fg outline-none placeholder:text-fg-muted focus:border-accent"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(event.key)) {
            event.stopPropagation();
          }
        }}
        placeholder={placeholder}
        ref={inputRef}
        value={value}
      />
    </div>
  );
}

// Styled MUI toolbar dropdown used instead of native select; supports a leading icon.
// Trigger: weight 500, token colors/border, 9px radius, 34px minimum height.
export function MenuSelect({
  ariaLabel,
  leadingIcon,
  onChange,
  options,
  searchPlaceholder = "Search...",
  searchable = false,
  triggerClassName,
  value,
}: Readonly<MenuSelectProps>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState("");
  const open = Boolean(anchorEl);
  const selected = options.find((option) => option.value === value);
  const filteredOptions = search
    ? options.filter((option) =>
        `${option.label} ${option.secondary ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
    : options;

  function closeMenu() {
    setAnchorEl(null);
    setSearch("");
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={cn(triggerClass, triggerClassName)}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        type="button"
      >
        {leadingIcon ? <span className="flex shrink-0 text-fg-muted">{leadingIcon}</span> : null}
        <span className="min-w-0 truncate">{selected?.label ?? ariaLabel}</span>
        <CaretDown aria-hidden className="shrink-0 text-fg-muted" size={11} weight="bold" />
      </button>
      <Menu
        anchorEl={anchorEl}
        autoFocus={!searchable}
        disableAutoFocusItem={searchable}
        disableRestoreFocus
        onClose={closeMenu}
        open={open}
        slotProps={{
          list: { "aria-label": ariaLabel, dense: true, sx: { padding: 0 } },
          paper: { sx: menuSelectPaperSx },
        }}
      >
        {searchable ? (
          <MenuSearchField onChange={setSearch} placeholder={searchPlaceholder} value={search} />
        ) : null}
        {filteredOptions.length === 0 ? (
          <div className="px-2 py-2 text-[12px] text-fg-muted">No matches</div>
        ) : null}
        {filteredOptions.map((option) => (
          <MenuSelectOptionItem
            current={option.value === value}
            key={option.value}
            onSelect={() => {
              onChange(option.value);
              closeMenu();
            }}
            option={option}
          />
        ))}
      </Menu>
    </>
  );
}

export function MenuMultiSelect({
  ariaLabel,
  leadingIcon,
  minSelected = 1,
  onChange,
  options,
  placeholder = ariaLabel,
  searchPlaceholder = "Search...",
  searchable = false,
  summary,
  triggerClassName,
  values,
}: Readonly<MenuMultiSelectProps>) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [menuWidth, setMenuWidth] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const open = Boolean(anchorEl);
  const selectedValues = new Set(values);
  const selected = options.filter((option) => selectedValues.has(option.value));
  const filteredOptions = search
    ? options.filter((option) => option.label.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  function closeMenu() {
    setAnchorEl(null);
    setMenuWidth(null);
    setSearch("");
  }

  function openMenu(element: HTMLElement) {
    setMenuWidth(element.getBoundingClientRect().width);
    setAnchorEl(element);
  }

  function toggle(value: string) {
    const next = selectedValues.has(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
    if (next.length < minSelected) {
      return;
    }
    onChange(next);
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={cn(triggerClass, triggerClassName)}
        onClick={(event) => openMenu(event.currentTarget)}
        style={open && menuWidth ? { width: menuWidth } : undefined}
        type="button"
      >
        {leadingIcon ? <span className="flex shrink-0 text-fg-muted">{leadingIcon}</span> : null}
        <span className="min-w-0 truncate">{selectedSummary(selected, placeholder, summary)}</span>
        <CaretDown aria-hidden className="shrink-0 text-fg-muted" size={11} weight="bold" />
      </button>
      <Menu
        anchorEl={anchorEl}
        autoFocus={!searchable}
        disableAutoFocusItem={searchable}
        disableRestoreFocus
        onClose={closeMenu}
        open={open}
        slotProps={{
          list: { "aria-label": ariaLabel, dense: true, sx: { padding: 0 } },
          paper: { sx: { ...menuSelectPaperSx, minWidth: Math.max(menuWidth ?? 0, 180) } },
        }}
      >
        {searchable ? (
          <MenuSearchField onChange={setSearch} placeholder={searchPlaceholder} value={search} />
        ) : null}
        {filteredOptions.length === 0 ? (
          <div className="px-2 py-2 text-[12px] text-fg-muted">No matches</div>
        ) : null}
        {filteredOptions.map((option) => {
          const current = selectedValues.has(option.value);
          const disabled = current && values.length <= minSelected;
          return (
            <MenuItem
              aria-checked={current}
              disabled={disabled}
              key={option.value}
              onClick={() => toggle(option.value)}
              role="menuitemcheckbox"
              sx={menuSelectRowSx}
            >
              <span className={current ? "font-semibold text-fg" : undefined}>{option.label}</span>
              {current ? (
                <Check aria-hidden className="text-accent-text" size={15} weight="bold" />
              ) : null}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
