"use client";

import { MenuItem } from "@/components/ui/MenuItem";
import { menuSelectRowStyle } from "@/components/ui/MenuSelectOptionItem";
import { cn } from "@/lib/ui/cn";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import type { MenuSelectOption } from "./menu-select-support";

export function MenuMultiSelectOption({
  current,
  disabled,
  onSelect,
  option,
}: Readonly<{
  current: boolean;
  disabled: boolean;
  onSelect: () => void;
  option: MenuSelectOption;
}>) {
  return (
    <MenuItem
      aria-checked={current}
      disabled={disabled}
      onClick={onSelect}
      role="menuitemcheckbox"
      style={menuSelectRowStyle}
    >
      <span className={cn("min-w-0 flex-1", current && "text-fg")}>
        {option.label}
        {option.secondary ? (
          <span className="ml-1 font-normal text-fg-muted">/ {option.secondary}</span>
        ) : null}
      </span>
      <span className="grid size-[15px] shrink-0 place-items-center">
        {current ? (
          <Check aria-hidden className="text-accent-text" size={15} weight="regular" />
        ) : null}
      </span>
    </MenuItem>
  );
}
