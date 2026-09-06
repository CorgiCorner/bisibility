"use client";

import {
  trailingExternalIcon as ExternalIcon,
  type UserMenuLink,
} from "@/components/shell/user-menu-items";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { menuItemRowHoverSx } from "@/lib/ui/menu-item-row-styles";
import MenuItem from "@mui/material/MenuItem";
import Link from "next/link";

export const USER_MENU_ROW_SX = {
  borderRadius: UI_RADIUS_ROLES.control,
  color: "var(--fg)",
  fontSize: "13px",
  gap: "10px",
  minHeight: 0,
  paddingX: "9px",
  paddingY: "8px",
  ...menuItemRowHoverSx,
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
      <MenuItem disabled={disabled} onClick={onSelect} sx={USER_MENU_ROW_SX}>
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
        sx={USER_MENU_ROW_SX}
        target="_blank"
      >
        {content}
      </MenuItem>
    );
  }

  return (
    <MenuItem component={Link} href={item.href ?? "#"} onClick={onClose} sx={USER_MENU_ROW_SX}>
      {content}
    </MenuItem>
  );
}
