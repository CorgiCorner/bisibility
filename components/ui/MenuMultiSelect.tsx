"use client";

import { MenuMultiSelectOption } from "@/components/ui/MenuMultiSelectOption";
import { menuSelectRowSx } from "@/components/ui/MenuSelectOptionItem";
import { menuTransitionDuration, useMenuExitLifecycle } from "@/components/ui/menu-exit-lifecycle";
import {
  MenuSearchField,
  type MenuSelectOption,
  menuSelectPaperSx,
  menuSelectTriggerClass,
  selectedSummary,
} from "@/components/ui/menu-select-support";
import { cn } from "@/lib/ui/cn";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { CaretDownIcon as CaretDown, CheckIcon as Check } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

export type MenuMultiSelectProps = {
  allLabel?: string;
  ariaLabel: string;
  leadingIcon?: ReactNode;
  minSelected?: number;
  onChange: (values: string[]) => void;
  options: readonly MenuSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  summary?: (selected: readonly MenuSelectOption[]) => string;
  summaryClassName?: string;
  triggerClassName?: string;
  values: readonly string[];
};

export function MenuMultiSelect({
  allLabel,
  ariaLabel,
  leadingIcon,
  minSelected = 1,
  onChange,
  options,
  placeholder = ariaLabel,
  searchPlaceholder = "Search...",
  searchable = false,
  summary,
  summaryClassName,
  triggerClassName,
  values,
}: Readonly<MenuMultiSelectProps>) {
  const [menuWidth, setMenuWidth] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const { anchorEl, closeMenu, handleExited, open, openMenu } = useMenuExitLifecycle(() => {
    setSearch("");
    setMenuWidth(null);
  });
  const selectedValues = new Set(values);
  const selected = options.filter((option) => selectedValues.has(option.value));
  const filteredOptions = search
    ? options.filter((option) =>
        `${option.label} ${option.secondary ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
    : options;

  function openMenuWithWidth(element: HTMLElement) {
    setMenuWidth(element.getBoundingClientRect().width);
    openMenu(element);
  }

  function toggle(value: string) {
    const next = selectedValues.has(value)
      ? values.filter((item) => item !== value)
      : [...values, value];
    if (next.length < minSelected) return;
    onChange(next);
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={cn(menuSelectTriggerClass, triggerClassName)}
        onClick={(event) => openMenuWithWidth(event.currentTarget)}
        style={open && menuWidth ? { width: menuWidth } : undefined}
        type="button"
      >
        {leadingIcon ? <span className="flex shrink-0 text-fg-muted">{leadingIcon}</span> : null}
        <span className={cn("min-w-0 truncate text-fg", summaryClassName)}>
          {selectedSummary(selected, placeholder, summary)}
        </span>
        <CaretDown aria-hidden className="shrink-0 text-fg-muted" size={11} weight="regular" />
      </button>
      <Menu
        anchorEl={anchorEl}
        autoFocus={!searchable}
        disableAutoFocusItem={searchable}
        onClose={closeMenu}
        open={open}
        slotProps={{
          list: { "aria-label": ariaLabel, dense: true, sx: { padding: 0 } },
          paper: { sx: { ...menuSelectPaperSx, minWidth: Math.max(menuWidth ?? 0, 180) } },
          transition: { onExited: handleExited },
        }}
        transitionDuration={menuTransitionDuration}
      >
        {searchable ? (
          <MenuSearchField onChange={setSearch} placeholder={searchPlaceholder} value={search} />
        ) : null}
        {allLabel ? (
          <MenuItem
            aria-checked={values.length === 0}
            onClick={() => onChange([])}
            role="menuitemradio"
            sx={menuSelectRowSx}
          >
            <span className={values.length === 0 ? "text-fg" : undefined}>{allLabel}</span>
            {values.length === 0 ? (
              <Check aria-hidden className="text-accent-text" size={15} weight="regular" />
            ) : null}
          </MenuItem>
        ) : null}
        {filteredOptions.length === 0 ? (
          <div className="px-2 py-2 text-[12px] text-fg-muted">No results</div>
        ) : null}
        {filteredOptions.map((option) => (
          <MenuMultiSelectOption
            current={selectedValues.has(option.value)}
            disabled={selectedValues.has(option.value) && values.length <= minSelected}
            key={option.value}
            onSelect={() => toggle(option.value)}
            option={option}
          />
        ))}
      </Menu>
    </>
  );
}
