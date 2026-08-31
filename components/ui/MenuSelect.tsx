"use client";

import { MenuGroupHeading } from "@/components/ui/MenuGroupHeading";
import { MenuSelectOptionItem } from "@/components/ui/MenuSelectOptionItem";
import { menuTransitionDuration, useMenuExitLifecycle } from "@/components/ui/menu-exit-lifecycle";
import {
  filterFlatOptions,
  filterGroupedGroups,
  MenuSearchField,
  type MenuSelectInput,
  menuSelectPaperSx,
  menuSelectTriggerClass,
  resolveSelectedOption,
} from "@/components/ui/menu-select-support";
import { cn } from "@/lib/ui/cn";
import Menu from "@mui/material/Menu";
import type { SxProps, Theme } from "@mui/material/styles";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { Tooltip } from "./Tooltip";

export type { MenuSelectOption, MenuSelectOptionGroup } from "@/components/ui/menu-select-support";
export { menuSelectPaperSx, menuSelectTriggerClass } from "@/components/ui/menu-select-support";

type MenuSelectBaseProps = {
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
  ariaLabel: string;
  compact?: boolean;
  disabled?: boolean;
  emptyMessage?: string;
  leadingIcon?: ReactNode;
  leadingLabel?: ReactNode;
  menuMaxHeight?: string;
  menuMinWidth?: number;
  menuWidth?: number;
  noResultsMessage?: string;
  onChange: (value: string) => void;
  pinCaret?: boolean;
  searchPlaceholder?: string;
  searchable?: boolean;
  selectedContent?: (option: ReturnType<typeof resolveSelectedOption>) => ReactNode;
  triggerClassName?: string;
  triggerTitle?: string;
  triggerWrapperClassName?: string;
  value: string;
};

export type MenuSelectProps = MenuSelectBaseProps & MenuSelectInput;

export function MenuSelect({
  ariaDescribedBy,
  ariaInvalid,
  ariaLabel,
  compact = false,
  disabled,
  emptyMessage,
  leadingIcon,
  leadingLabel,
  menuMaxHeight,
  menuMinWidth,
  menuWidth,
  noResultsMessage,
  onChange,
  pinCaret = false,
  searchPlaceholder = "Search...",
  searchable = false,
  selectedContent,
  triggerClassName,
  triggerTitle,
  triggerWrapperClassName,
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

  const resolvedMenuWidth = menuWidth ?? anchorEl?.getBoundingClientRect().width;
  const paperSx = {
    ...menuSelectPaperSx,
    ...(menuMinWidth !== undefined
      ? {
          maxWidth: "calc(100vw - 32px)",
          minWidth: `min(${menuMinWidth}px, calc(100vw - 32px))`,
          width: "max-content",
        }
      : resolvedMenuWidth === undefined
        ? {}
        : { maxWidth: resolvedMenuWidth, minWidth: resolvedMenuWidth }),
    maxHeight: menuMaxHeight ?? "min(360px, calc(100dvh - 84px))",
    overflowY: "auto",
  } satisfies SxProps<Theme>;

  const triggerButton = (
    <button
      aria-describedby={ariaDescribedBy}
      aria-expanded={open}
      aria-haspopup="menu"
      aria-invalid={ariaInvalid}
      aria-label={ariaLabel}
      className={cn(menuSelectTriggerClass, compact && "text-[12px] leading-4", triggerClassName)}
      disabled={disabled}
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
      <CaretDown
        aria-hidden
        className={cn("shrink-0 text-fg-muted", pinCaret && "ml-auto")}
        data-menu-select-caret
        data-pinned={pinCaret || undefined}
        size={11}
        weight="regular"
      />
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
        anchorOrigin={{ horizontal: "left", vertical: "bottom" }}
        autoFocus={!searchable}
        disableAutoFocusItem={searchable}
        disablePortal={false}
        marginThreshold={16}
        onClose={closeMenu}
        open={open}
        slotProps={{
          list: { "aria-label": ariaLabel, dense: true, sx: { padding: 0 } },
          paper: {
            sx: paperSx,
          },
          transition: { onExited: handleExited },
        }}
        transformOrigin={{ horizontal: "left", vertical: "top" }}
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
          ? groupedFiltered.flatMap((group, groupIndex) => [
              <MenuGroupHeading first={groupIndex === 0} key={`${group.id}-heading`}>
                {group.label}
              </MenuGroupHeading>,
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

export { MenuMultiSelect, type MenuMultiSelectProps } from "./MenuMultiSelect";
