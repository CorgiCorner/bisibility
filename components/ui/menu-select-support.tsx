"use client";

import { Input } from "@/components/ui/Input";
import { compactInputClassName, inputClassName } from "@/components/ui/input-styles";
import { toolbarControlClassName } from "@/components/ui/toolbar-control-styles";
import { cn } from "@/lib/ui/cn";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { type ReactNode, useCallback, useId } from "react";

export type MenuSelectOption = {
  ariaLabel?: string;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  noWrap?: boolean;
  secondary?: string;
  searchText?: string;
  trailing?: ReactNode;
  tooltip?: string;
  value: string;
};

export type MenuSelectOptionGroup = {
  hideHeading?: boolean;
  id: string;
  label: string;
  options: readonly MenuSelectOption[];
  searchOnly?: boolean;
};

export type FlatInput = {
  groups?: never;
  options: readonly MenuSelectOption[];
};

export type GroupedInput = {
  groups: readonly MenuSelectOptionGroup[];
  options?: never;
};

export type MenuSelectInput = FlatInput | GroupedInput;

export const menuSelectPaperStyle = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: UI_RADIUS_ROLES.card,
  boxShadow: "none",
  color: "var(--fg)",
  marginTop: "6px",
  minWidth: 180,
  padding: "6px",
} as const;

export const menuSelectTriggerClass = cn(
  toolbarControlClassName,
  "inline-flex items-center gap-1.5 px-[11px] outline-none transition-colors hover:border-accent focus-visible:border-accent focus-visible:outline-none",
);

export const menuSelectInputClass = cn(
  inputClassName,
  "inline-flex min-h-10 w-full items-center gap-1.5 rounded-control px-[13px] py-[9px] text-ui-body font-medium",
);

function matchOption(option: MenuSelectOption, term: string): boolean {
  const haystack =
    `${option.label} ${option.secondary ?? ""} ${option.searchText ?? ""}`.toLowerCase();
  return haystack.includes(term);
}

export function filterFlatOptions(
  options: readonly MenuSelectOption[],
  search: string,
): readonly MenuSelectOption[] {
  const term = search.trim().toLowerCase();
  if (!term) return options;
  return options.filter((option) => matchOption(option, term));
}

export function filterGroupedGroups(
  groups: readonly MenuSelectOptionGroup[],
  search: string,
): readonly MenuSelectOptionGroup[] {
  const term = search.trim().toLowerCase();
  if (!term) return groups.filter((group) => !group.searchOnly && group.options.length > 0);
  return groups
    .map((group) => ({
      ...group,
      options: group.options.filter((option) => matchOption(option, term)),
    }))
    .filter((group) => group.options.length > 0);
}

export function flattenGroupedOptions(
  groups: readonly MenuSelectOptionGroup[],
): readonly MenuSelectOption[] {
  return groups.flatMap((group) => group.options);
}

export function resolveSelectedOption(
  input: MenuSelectInput,
  value: string,
): MenuSelectOption | undefined {
  if ("groups" in input && input.groups) {
    return flattenGroupedOptions(input.groups).find((option) => option.value === value);
  }
  if ("options" in input && input.options) {
    return input.options.find((option) => option.value === value);
  }
  return undefined;
}

export function selectedSummary(
  selected: readonly MenuSelectOption[],
  placeholder: string,
  summary?: (selected: readonly MenuSelectOption[]) => string,
) {
  if (summary) return summary(selected);
  if (selected.length === 0) return placeholder;
  if (selected.length <= 2) return selected.map((option) => option.label).join(", ");
  return `${selected.length} selected`;
}

type MenuSearchFieldProps = {
  hint?: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

export function MenuSearchField({
  hint,
  onChange,
  placeholder,
  value,
}: Readonly<MenuSearchFieldProps>) {
  const hintId = useId();
  // preventScroll: focusing the field must not move the page behind the open menu.
  const focusInput = useCallback(
    (input: HTMLInputElement | null) => input?.focus({ preventScroll: true }),
    [],
  );
  return (
    // Pinned to the menu's top edge: a long catalog scrolls under the field instead of taking it
    // out of reach. The negative offset cancels the menu's own padding so nothing shows above it.
    <div className="sticky -top-1.5 z-20 -mx-1.5 -mt-1.5 bg-bg-elev px-2.5 pb-1 pt-1.5">
      <div className="relative">
        <MagnifyingGlass
          weight="regular"
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-2 text-fg-muted"
          size={16}
        />
        <Input
          data-menu-search
          aria-describedby={hint ? hintId : undefined}
          aria-label={placeholder}
          className={cn(
            compactInputClassName,
            "min-h-8 w-full rounded-control border border-border-control bg-bg-elev pl-8 pr-2.5 text-fg outline-none focus:border-accent",
          )}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              const items = event.currentTarget
                .closest('[role="menu"], [role="listbox"]')
                ?.querySelectorAll<HTMLElement>("[data-menu-item]:not([data-disabled])");
              const item = event.key === "ArrowDown" ? items?.[0] : items?.[items.length - 1];
              if (item) {
                event.preventDefault();
                event.stopPropagation();
                item.focus();
              }
            }
            if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(event.key)) {
              event.stopPropagation();
            }
          }}
          placeholder={placeholder}
          ref={focusInput}
          value={value}
        />
      </div>
      {hint ? (
        <p className="m-0 max-w-64 px-1 pt-1.5 text-ui-micro text-fg-muted" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
