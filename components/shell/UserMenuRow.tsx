"use client";

import {
  trailingExternalIcon as ExternalIcon,
  type UserMenuLink,
} from "@/components/shell/user-menu-items";
import { MenuItem } from "@/components/ui/MenuItem";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { menuItemRowHoverStyle } from "@/lib/ui/menu-item-row-styles";
import Link from "next/link";

export const USER_MENU_ROW_STYLE = {
  borderRadius: UI_RADIUS_ROLES.control,
  "--control-color": "var(--fg)",
  fontSize: "13px",
  gap: "10px",
  minHeight: 0,
  paddingLeft: "9px",
  paddingRight: "9px",
  paddingTop: "8px",
  paddingBottom: "8px",
  ...menuItemRowHoverStyle,
} as const;

export type UserMenuRowProps = {
  item: UserMenuLink;
  disabled?: boolean;
  onClose?: () => void;
  /** Action rows (sign out): handle selection instead of navigating. */
  onSelect?: () => void;
};

export function UserMenuRow({ item, disabled, onClose, onSelect }: Readonly<UserMenuRowProps>) {
  const Icon = item.icon;
  const content = (
    <>
      <Icon aria-hidden className="text-fg-muted" size={16} weight="regular" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.external ? (
        <ExternalIcon aria-hidden className="text-fg-muted" size={13} weight="regular" />
      ) : null}
    </>
  );

  if (onSelect) {
    return (
      <MenuItem disabled={disabled} onClick={onSelect} style={USER_MENU_ROW_STYLE}>
        {content}
      </MenuItem>
    );
  }

  if (item.external) {
    return (
      <MenuItem
        aria-label={`${item.label} (opens in a new tab)`}
        component="a"
        href={item.href ?? "#"}
        onClick={onClose}
        rel="noopener"
        style={USER_MENU_ROW_STYLE}
        target="_blank"
      >
        {content}
      </MenuItem>
    );
  }

  return (
    <MenuItem
      component={Link}
      href={item.href ?? "#"}
      onClick={onClose}
      style={USER_MENU_ROW_STYLE}
    >
      {content}
    </MenuItem>
  );
}
