"use client";

import MenuItem from "@mui/material/MenuItem";
import { CheckIcon as Check } from "@phosphor-icons/react";
import type { MenuSelectOption } from "./menu-select-support";

export const menuSelectRowSx = {
  borderRadius: "9px",
  color: "var(--fg-muted)",
  fontSize: "13px",
  gap: "12px",
  justifyContent: "space-between",
  minHeight: 0,
  paddingX: "9px",
  paddingY: "8px",
  "&:hover": { backgroundColor: "var(--nav-active)" },
  "&.Mui-focusVisible": { backgroundColor: "var(--nav-active)" },
} as const;

type MenuSelectOptionItemProps = {
  current: boolean;
  onSelect: () => void;
  option: MenuSelectOption;
};

export function MenuSelectOptionItem({
  current,
  onSelect,
  option,
}: Readonly<MenuSelectOptionItemProps>) {
  return (
    <MenuItem
      aria-label={option.ariaLabel}
      data-current={current || undefined}
      disabled={option.disabled}
      onClick={() => {
        if (option.disabled) return;
        onSelect();
      }}
      sx={{
        ...menuSelectRowSx,
        ...(option.disabled && option.tooltip ? { pointerEvents: "auto" } : {}),
      }}
      title={option.tooltip}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {option.icon ? <span className="flex shrink-0 text-fg-muted">{option.icon}</span> : null}
        <span className="min-w-0">
          <span className={current ? "block font-semibold text-fg" : "block"}>{option.label}</span>
          {option.secondary ? (
            <span className="block font-mono text-[11px] text-fg-muted">{option.secondary}</span>
          ) : null}
        </span>
      </span>
      {current ? <Check aria-hidden className="text-accent-text" size={15} weight="bold" /> : null}
    </MenuItem>
  );
}
