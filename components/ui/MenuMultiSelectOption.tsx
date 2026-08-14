"use client";

import { menuSelectRowSx } from "@/components/ui/MenuSelectOptionItem";
import MenuItem from "@mui/material/MenuItem";
import { CheckIcon as Check } from "@phosphor-icons/react";
import type { MenuSelectOption } from "./MenuSelect";

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
      sx={menuSelectRowSx}
    >
      <span className={current ? "font-semibold text-fg" : undefined}>
        {option.label}
        {option.secondary ? (
          <span className="ml-1 font-normal text-fg-muted">/ {option.secondary}</span>
        ) : null}
      </span>
      {current ? <Check aria-hidden className="text-accent-text" size={15} weight="bold" /> : null}
    </MenuItem>
  );
}
