"use client";

import { Menu } from "@/components/ui/Menu";
import { MenuGroupHeading } from "@/components/ui/MenuGroupHeading";
import { MenuSelectOptionItem } from "@/components/ui/MenuSelectOptionItem";
import { useMenuExitLifecycle } from "@/components/ui/menu-exit-lifecycle";
import {
  filterFlatOptions,
  filterGroupedGroups,
  MenuSearchField,
  type MenuSelectInput,
  menuSelectInputClass,
  menuSelectPaperStyle,
  menuSelectTriggerClass,
  resolveSelectedOption,
} from "@/components/ui/menu-select-support";
import { track } from "@/lib/analytics/client";
import { type AnalyticsControlId, analyticsControlModule } from "@/lib/analytics/controls";
import { cn } from "@/lib/ui/cn";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import type { CSSProperties } from "react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";

export type { MenuSelectOption, MenuSelectOptionGroup } from "@/components/ui/menu-select-support";
export { menuSelectPaperStyle, menuSelectTriggerClass } from "@/components/ui/menu-select-support";

type MenuSelectBaseProps = {
  analytics?: { control: AnalyticsControlId };
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  ariaLabel: string;
  compact?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  /** Off for options a remote source already narrowed to the search text; the list shows them as given. */
  filterOptions?: boolean;
  leadingIcon?: ReactNode;
  leadingLabel?: ReactNode;
  menuMaxHeight?: string;
  menuMinWidth?: number;
  menuWidth?: number;
  noResultsMessage?: string;
  onChange: (value: string) => void;
  /** Receives the search field's text as it changes and "" when the menu closes, for remote sources. */
  onSearchChange?: (value: string) => void;
  pinCaret?: boolean;
  searchHint?: string;
  searchPlaceholder?: string;
  searchable?: boolean;
  selectedContent?: (option: ReturnType<typeof resolveSelectedOption>) => ReactNode;
  size?: "input" | "toolbar";
  trailingIcon?: ReactNode;
  triggerClassName?: string;
  triggerTitle?: string;
  triggerWrapperClassName?: string;
  value: string;
};

export type MenuSelectProps = MenuSelectBaseProps & MenuSelectInput;

export function MenuSelect({
  analytics,
  ariaDescribedBy,
  ariaInvalid,
  ariaLabel,
  compact = false,
  disabled,
  emptyMessage,
  filterOptions = true,
  leadingIcon,
  leadingLabel,
  menuMaxHeight,
  menuMinWidth,
  menuWidth,
  noResultsMessage,
  onChange,
  onSearchChange,
  pinCaret = true,
  searchHint,
  searchPlaceholder = "Search...",
  searchable = false,
  selectedContent,
  size = "toolbar",
  trailingIcon,
  triggerClassName,
  triggerTitle,
  triggerWrapperClassName,
  value,
  ...input
}: Readonly<MenuSelectProps>) {
  const [search, setSearch] = useState("");
  const contentRef = useRef<HTMLDivElement | null>(null);
  const { anchorEl, closeMenu, handleExited, open, openMenu } = useMenuExitLifecycle(() =>
    changeSearch(""),
  );

  // Runs once per open, when the menu's element mounts: a long catalog opens on the current
  // value instead of on its first row. Scrolling the container keeps the page where it is.
  const attachContent = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    const current = node?.querySelector<HTMLElement>("[data-current]");
    if (!node || !current) return;
    node.scrollTop = Math.max(
      0,
      current.offsetTop - node.clientHeight / 2 + current.offsetHeight / 2,
    );
  }, []);

  function changeSearch(next: string) {
    setSearch(next);
    onSearchChange?.(next);
    // A filtered list is read from its first match, so the menu never keeps a scroll offset
    // that belonged to the previous result set.
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }
  const isGrouped = "groups" in input && input.groups != null;
  const selected = resolveSelectedOption(input, value);
  const flatFiltered = isGrouped
    ? []
    : filterOptions
      ? filterFlatOptions(input.options ?? [], search)
      : (input.options ?? []);
  const groupedFiltered = isGrouped ? filterGroupedGroups(input.groups, search) : [];
  const hasResults = isGrouped ? groupedFiltered.length > 0 : flatFiltered.length > 0;
  const hasHiddenOptions =
    isGrouped && input.groups.some((group) => group.searchOnly && group.options.length > 0);
  const searchHelp = search.trim()
    ? undefined
    : (searchHint ?? (hasHiddenOptions ? "More options available. Type to search." : undefined));

  const minimumMenuWidth =
    menuWidth ??
    menuMinWidth ??
    Math.max(
      compact ? 0 : (anchorEl?.getBoundingClientRect().width ?? 0),
      menuSelectPaperStyle.minWidth,
    );
  const paperStyle: CSSProperties = {
    ...menuSelectPaperStyle,
    boxSizing: "border-box",
    maxWidth: "calc(100vw - 32px)",
    minWidth: `min(${minimumMenuWidth}px, calc(100vw - 32px))`,
    width: menuWidth ?? "max-content",
    maxHeight: menuMaxHeight ?? "min(360px, calc(100dvh - 84px))",
    overflowX: "hidden",
    overflowY: "auto",
  };

  function selectValue(nextValue: string) {
    onChange(nextValue);
    if (analytics) {
      track("ui_option_selected", {
        control: analytics.control,
        module: analyticsControlModule(analytics.control),
        value: nextValue,
      });
    }
    closeMenu();
  }

  const triggerButton = (
    <button
      aria-describedby={ariaDescribedBy}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-invalid={ariaInvalid}
      aria-label={ariaLabel}
      className={cn(
        size === "input" ? menuSelectInputClass : menuSelectTriggerClass,
        compact && "text-[12px] leading-4",
        triggerClassName,
      )}
      disabled={disabled}
      data-state={open ? "open" : "closed"}
      onClick={(event) => openMenu(event.currentTarget)}
      type="button"
    >
      {leadingLabel ? (
        <span className="flex min-w-0 items-center gap-1.5" data-menu-select-content>
          <span className="shrink-0 text-fg-muted">{leadingLabel}</span>
          {selectedContent ? (
            <span className="min-w-0 text-fg">{selectedContent(selected)}</span>
          ) : (
            <span className={cn("min-w-0 truncate text-fg", compact && "text-[12px] leading-4")}>
              {selected?.label ?? ariaLabel}
            </span>
          )}
        </span>
      ) : (
        <>
          {leadingIcon ? <span className="flex shrink-0 text-fg-muted">{leadingIcon}</span> : null}
          {selectedContent ? (
            <span className="min-w-0 text-fg">{selectedContent(selected)}</span>
          ) : (
            <span className={cn("min-w-0 truncate text-fg", compact && "text-[12px] leading-4")}>
              {selected?.label ?? ariaLabel}
            </span>
          )}
        </>
      )}
      {trailingIcon ?? (
        <CaretDown
          aria-hidden
          className={cn("shrink-0 text-fg-muted", pinCaret && "ml-auto")}
          data-menu-select-caret
          data-pinned={pinCaret || undefined}
          size={11}
          weight="regular"
        />
      )}
    </button>
  );

  return (
    <>
      {triggerTitle ? (
        <Tooltip
          content={triggerTitle}
          semantics="description"
          wrapperClassName={triggerWrapperClassName}
        >
          {triggerButton}
        </Tooltip>
      ) : (
        triggerButton
      )}
      <Menu
        anchorEl={anchorEl}
        align="start"
        side="bottom"
        autoFocus={!searchable}
        onClose={closeMenu}
        open={open}
        listProps={{ "aria-label": ariaLabel, style: { padding: 0 } }}
        contentProps={{
          ref: attachContent,
          style: paperStyle,
        }}
        onExited={handleExited}
      >
        {searchable ? (
          <MenuSearchField
            hint={searchHelp}
            onChange={changeSearch}
            placeholder={searchPlaceholder}
            value={search}
          />
        ) : null}
        {!hasResults && (search.trim() || emptyMessage || !hasHiddenOptions || !searchable) ? (
          <div className="px-2 py-2 text-[12px] text-fg-muted">
            {search.trim() ? (noResultsMessage ?? "No results") : (emptyMessage ?? "No results")}
          </div>
        ) : null}
        {isGrouped
          ? groupedFiltered.flatMap((group, groupIndex) => [
              group.hideHeading ? null : (
                <MenuGroupHeading first={groupIndex === 0} key={`${group.id}-heading`}>
                  {group.label}
                </MenuGroupHeading>
              ),
              ...group.options.map((option) => (
                <MenuSelectOptionItem
                  current={option.value === value}
                  key={option.value}
                  onSelect={() => selectValue(option.value)}
                  option={option}
                />
              )),
            ])
          : flatFiltered.map((option) => (
              <MenuSelectOptionItem
                current={option.value === value}
                key={option.value}
                onSelect={() => selectValue(option.value)}
                option={option}
              />
            ))}
      </Menu>
    </>
  );
}

export { MenuMultiSelect, type MenuMultiSelectProps } from "./MenuMultiSelect";
