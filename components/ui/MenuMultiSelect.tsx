"use client";

import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { MenuMultiSelectOption } from "@/components/ui/MenuMultiSelectOption";
import { menuSelectRowStyle } from "@/components/ui/MenuSelectOptionItem";
import { useMenuExitLifecycle } from "@/components/ui/menu-exit-lifecycle";
import {
  MenuSearchField,
  type MenuSelectOption,
  menuSelectPaperStyle,
  menuSelectTriggerClass,
  selectedSummary,
} from "@/components/ui/menu-select-support";
import { track } from "@/lib/analytics/client";
import { type AnalyticsControlId, analyticsControlModule } from "@/lib/analytics/controls";
import { cn } from "@/lib/ui/cn";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import { type ReactNode, useState } from "react";

export type MenuMultiSelectProps = {
  analytics?: { control: AnalyticsControlId };
  allLabel?: string;
  allSelected?: boolean;
  ariaLabel: string;
  leadingIcon?: ReactNode;
  minSelected?: number;
  onChange: (values: string[]) => void;
  onSelectAll?: () => void;
  options: readonly MenuSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  summary?: (selected: readonly MenuSelectOption[]) => string;
  summaryClassName?: string;
  trailingIcon?: ReactNode;
  triggerClassName?: string;
  values: readonly string[];
};

export function MenuMultiSelect({
  analytics,
  allLabel,
  allSelected,
  ariaLabel,
  leadingIcon,
  minSelected = 1,
  onChange,
  onSelectAll,
  options,
  placeholder = ariaLabel,
  searchPlaceholder = "Search...",
  searchable = false,
  summary,
  summaryClassName,
  trailingIcon,
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
    if (analytics) {
      track("ui_option_selected", {
        control: analytics.control,
        module: analyticsControlModule(analytics.control),
        value: next,
      });
    }
  }

  function selectAll() {
    if (onSelectAll) onSelectAll();
    else onChange([]);
    if (analytics) {
      track("ui_option_selected", {
        control: analytics.control,
        module: analyticsControlModule(analytics.control),
        value: [],
      });
    }
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={ariaLabel}
        className={cn(menuSelectTriggerClass, triggerClassName)}
        data-state={open ? "open" : "closed"}
        onClick={(event) => openMenuWithWidth(event.currentTarget)}
        style={open && menuWidth ? { width: menuWidth } : undefined}
        type="button"
      >
        {leadingIcon ? <span className="flex shrink-0 text-fg-muted">{leadingIcon}</span> : null}
        <span className={cn("min-w-0 truncate text-fg", summaryClassName)}>
          {selectedSummary(selected, placeholder, summary)}
        </span>
        {trailingIcon ?? (
          <CaretDown
            aria-hidden
            className="ml-auto shrink-0 text-fg-muted"
            size={11}
            weight="regular"
          />
        )}
      </button>
      <Menu
        anchorEl={anchorEl}
        autoFocus={!searchable}
        onClose={closeMenu}
        open={open}
        listProps={{ "aria-label": ariaLabel, style: { padding: 0 } }}
        contentProps={{
          style: {
            ...menuSelectPaperStyle,
            boxSizing: "border-box",
            maxWidth: "calc(100vw - 32px)",
            minWidth: `min(${Math.max(menuWidth ?? 0, 180)}px, calc(100vw - 32px))`,
            overflowX: "hidden",
            width: "max-content",
          },
        }}
        onExited={handleExited}
      >
        {searchable ? (
          <MenuSearchField onChange={setSearch} placeholder={searchPlaceholder} value={search} />
        ) : null}
        {allLabel ? (
          <MenuItem
            aria-checked={allSelected ?? values.length === 0}
            onClick={selectAll}
            role="menuitemradio"
            style={menuSelectRowStyle}
          >
            <span
              className={cn("min-w-0 flex-1", (allSelected ?? values.length === 0) && "text-fg")}
            >
              {allLabel}
            </span>
            <span className="grid size-[15px] shrink-0 place-items-center">
              {(allSelected ?? values.length === 0) ? (
                <Check aria-hidden className="text-accent-text" size={15} weight="regular" />
              ) : null}
            </span>
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
