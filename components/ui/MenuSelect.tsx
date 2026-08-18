"use client";

import { MenuMultiSelectOption } from "@/components/ui/MenuMultiSelectOption";
import { MenuSelectOptionItem, menuSelectRowSx } from "@/components/ui/MenuSelectOptionItem";
import { menuTransitionDuration, useMenuExitLifecycle } from "@/components/ui/menu-exit-lifecycle";
import {
  filterFlatOptions,
  filterGroupedGroups,
  MenuSearchField,
  type MenuSelectInput,
  type MenuSelectOption,
  menuSelectPaperSx,
  menuSelectTriggerClass,
  resolveSelectedOption,
  selectedSummary,
} from "@/components/ui/menu-select-support";
import { cn } from "@/lib/ui/cn";
import ListSubheader from "@mui/material/ListSubheader";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { CaretDownIcon as CaretDown, CheckIcon as Check } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { Tooltip } from "./Tooltip";

export type { MenuSelectOption, MenuSelectOptionGroup } from "@/components/ui/menu-select-support";
export { menuSelectPaperSx } from "@/components/ui/menu-select-support";

type MenuSelectBaseProps = {
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  ariaLabel: string;
  disabled?: boolean;
  emptyMessage?: string;
  leadingIcon?: ReactNode;
  menuWidth?: number;
  noResultsMessage?: string;
  onChange: (value: string) => void;
  searchPlaceholder?: string;
  searchable?: boolean;
  triggerClassName?: string;
  triggerTitle?: string;
  value: string;
};

export type MenuSelectProps = MenuSelectBaseProps & MenuSelectInput;

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
  triggerClassName?: string;
  values: readonly string[];
};

export function MenuSelect({
  ariaDescribedBy,
  ariaInvalid,
  ariaLabel,
  disabled,
  emptyMessage,
  leadingIcon,
  menuWidth,
  noResultsMessage,
  onChange,
  searchPlaceholder = "Search...",
  searchable = false,
  triggerClassName,
  triggerTitle,
  value,
  ...input
}: Readonly<MenuSelectProps>) {
  const [search, setSearch] = useState("");
  const { anchorEl, closeMenu, handleExited, open, openMenu } = useMenuExitLifecycle(() =>
    setSearch(""),
  );
  const isGrouped = "groups" in input && input.groups != null;
  const selected = resolveSelectedOption(input, value);
  const flatFiltered = isGrouped ? [] : filterFlatOptions(input.options ?? [], search);
  const groupedFiltered = isGrouped ? filterGroupedGroups(input.groups, search) : [];
  const hasResults = isGrouped ? groupedFiltered.length > 0 : flatFiltered.length > 0;

  const paperSx = menuWidth
    ? { ...menuSelectPaperSx, minWidth: menuWidth, maxWidth: menuWidth }
    : menuSelectPaperSx;

  const triggerButton = (
    <button
      aria-describedby={ariaDescribedBy}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-invalid={ariaInvalid}
      aria-label={ariaLabel}
      className={cn(menuSelectTriggerClass, triggerClassName)}
      disabled={disabled}
      onClick={(event) => openMenu(event.currentTarget)}
      type="button"
    >
      {leadingIcon ? <span className="flex shrink-0 text-fg-muted">{leadingIcon}</span> : null}
      <span className="min-w-0 truncate">{selected?.label ?? ariaLabel}</span>
      <CaretDown aria-hidden className="shrink-0 text-fg-muted" size={11} weight="bold" />
    </button>
  );

  return (
    <>
      {triggerTitle ? (
        <Tooltip content={triggerTitle} semantics="description">
          {triggerButton}
        </Tooltip>
      ) : (
        triggerButton
      )}
      <Menu
        anchorEl={anchorEl}
        autoFocus={!searchable}
        disableAutoFocusItem={searchable}
        onClose={closeMenu}
        open={open}
        slotProps={{
          list: { "aria-label": ariaLabel, dense: true, sx: { padding: 0 } },
          paper: { sx: paperSx },
          transition: { onExited: handleExited },
        }}
        transitionDuration={menuTransitionDuration}
      >
        {searchable ? (
          <MenuSearchField onChange={setSearch} placeholder={searchPlaceholder} value={search} />
        ) : null}
        {!hasResults ? (
          <div className="px-2 py-2 text-[12px] text-fg-muted">
            {search.trim() ? (noResultsMessage ?? "No results") : (emptyMessage ?? "No results")}
          </div>
        ) : null}
        {isGrouped
          ? groupedFiltered.flatMap((group) => [
              <ListSubheader
                key={`${group.id}-heading`}
                sx={{
                  backgroundColor: "transparent",
                  color: "var(--fg-muted)",
                  fontSize: "11px",
                  lineHeight: "normal",
                  paddingX: "9px",
                  paddingY: "4px",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {group.label}
              </ListSubheader>,
              ...group.options.map((option) => (
                <MenuSelectOptionItem
                  current={option.value === value}
                  key={option.value}
                  onSelect={() => {
                    onChange(option.value);
                    closeMenu();
                  }}
                  option={option}
                />
              )),
            ])
          : flatFiltered.map((option) => (
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
        <span className="min-w-0 truncate">{selectedSummary(selected, placeholder, summary)}</span>
        <CaretDown aria-hidden className="shrink-0 text-fg-muted" size={11} weight="bold" />
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
            <span className={values.length === 0 ? "font-semibold text-fg" : undefined}>
              {allLabel}
            </span>
            {values.length === 0 ? (
              <Check aria-hidden className="text-accent-text" size={15} weight="bold" />
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
