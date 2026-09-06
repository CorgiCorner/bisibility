"use client";

import { cn } from "@/lib/ui/cn";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { menuItemRowHoverSx } from "@/lib/ui/menu-item-row-styles";
import MenuItem from "@mui/material/MenuItem";
import { CheckIcon as Check } from "@phosphor-icons/react";
import type { MenuSelectOption } from "./menu-select-support";
import { Tooltip } from "./Tooltip";

export const menuSelectRowSx = {
  borderRadius: UI_RADIUS_ROLES.control,
  color: "var(--fg-muted)",
  fontSize: "13px",
  gap: "12px",
  justifyContent: "space-between",
  minHeight: 0,
  paddingX: "9px",
  paddingY: "8px",
  ...menuItemRowHoverSx,
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
  const item = (
    <MenuItem
      aria-label={option.ariaLabel}
      data-current={current || undefined}
      disabled={option.disabled}
      onClick={() => {
        if (option.disabled) return;
        onSelect();
      }}
      sx={menuSelectRowSx}
      style={option.disabled && option.tooltip ? { pointerEvents: "auto" } : undefined}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {option.icon ? <span className="flex shrink-0 text-fg-muted">{option.icon}</span> : null}
        <span className="min-w-0">
          <span className={cn("block", current && "text-fg", option.noWrap && "whitespace-nowrap")}>
            {option.label}
          </span>
          {option.secondary ? (
            <span
              className={cn(
                "block text-[11px] text-fg-muted",
                option.noWrap && "whitespace-nowrap",
              )}
            >
              {option.secondary}
            </span>
          ) : null}
        </span>
      </span>
      <span
        className="grid shrink-0 grid-cols-[max-content_15px] items-center gap-2"
        data-slot="menu-option-trailing"
      >
        <span className="justify-self-end">{option.trailing}</span>
        {current ? (
          <Check aria-hidden className="text-accent-text" size={15} weight="regular" />
        ) : (
          <span />
        )}
      </span>
    </MenuItem>
  );

  return option.tooltip ? (
    <Tooltip content={option.tooltip} semantics="description">
      {item}
    </Tooltip>
  ) : (
    item
  );
}
