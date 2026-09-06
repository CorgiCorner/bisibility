"use client";

import { compactInputClassName, inputClassName } from "@/components/ui/input-styles";
import { toolbarControlClassName } from "@/components/ui/toolbar-control-styles";
import { cn } from "@/lib/ui/cn";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { type ReactNode, useCallback } from "react";

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

export const menuSelectPaperSx = {
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
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
};

export function MenuSearchField({ onChange, placeholder, value }: Readonly<MenuSearchFieldProps>) {
  const focusInput = useCallback((input: HTMLInputElement | null) => input?.focus(), []);
  return (
    <div className="px-1 pb-1">
      <input
        aria-label={placeholder}
        className={cn(
          compactInputClassName,
          "min-h-8 w-full rounded-control border border-border-control bg-transparent px-2.5 text-fg outline-none focus:border-accent",
        )}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp", "Escape", "Tab"].includes(event.key)) {
            event.stopPropagation();
          }
        }}
        placeholder={placeholder}
        ref={focusInput}
        value={value}
      />
    </div>
  );
}
