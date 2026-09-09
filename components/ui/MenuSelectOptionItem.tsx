"use client";

import { MenuItem } from "@/components/ui/MenuItem";
import { cn } from "@/lib/ui/cn";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { menuItemRowHoverStyle } from "@/lib/ui/menu-item-row-styles";
import { CheckIcon as Check } from "@phosphor-icons/react/dist/csr/Check";
import type { MenuSelectOption } from "./menu-select-support";
import { Tooltip } from "./Tooltip";

export const menuSelectRowStyle = {
  borderRadius: UI_RADIUS_ROLES.control,
  "--control-color": "var(--fg-muted)",
  fontSize: "13px",
  gap: "12px",
  justifyContent: "space-between",
  minHeight: 0,
  overflowWrap: "anywhere",
  whiteSpace: "normal",
  paddingLeft: "9px",
  paddingRight: "9px",
  paddingTop: "8px",
  paddingBottom: "8px",
  ...menuItemRowHoverStyle,
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
      style={{
        ...menuSelectRowStyle,
        ...(option.disabled && option.tooltip ? { pointerEvents: "auto" } : {}),
      }}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        {option.icon ? <span className="flex shrink-0 text-fg-muted">{option.icon}</span> : null}
        <span className="min-w-0 flex-1">
          <span
            className={cn("block", current && "text-fg", option.noWrap && "truncate")}
            title={option.noWrap ? option.label : undefined}
          >
            {option.label}
          </span>
          {option.secondary ? (
            <span className={cn("block text-[11px] text-fg-muted", option.noWrap && "truncate")}>
              {option.secondary}
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2" data-slot="menu-option-trailing">
        {option.trailing != null ? <span>{option.trailing}</span> : null}
        <span className="grid size-[15px] shrink-0 place-items-center">
          {current ? (
            <Check aria-hidden className="text-accent-text" size={15} weight="regular" />
          ) : null}
        </span>
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
