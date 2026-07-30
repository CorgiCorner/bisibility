"use client";

import {
  trailingExternalIcon as ExternalIcon,
  type UserMenuLink,
} from "@/components/shell/user-menu-items";
import MenuItem from "@mui/material/MenuItem";
import Link from "next/link";

const ROW_SX = {
  borderRadius: "9px",
  color: "var(--fg)",
  fontSize: "13px",
  gap: "10px",
  minHeight: 0,
  paddingX: "9px",
  paddingY: "8px",
  "&:hover": { backgroundColor: "var(--nav-active)" },
  "&.Mui-focusVisible": { backgroundColor: "var(--nav-active)" },
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
      <Icon aria-hidden className="text-fg-muted" size={16} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.hint ? <span className="font-mono text-[11px] text-fg-faint">{item.hint}</span> : null}
      {item.external ? <ExternalIcon aria-hidden className="text-fg-faint" size={13} /> : null}
    </>
  );

  if (onSelect) {
    return (
      <MenuItem disabled={disabled} onClick={onSelect} sx={ROW_SX}>
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
        sx={ROW_SX}
        target="_blank"
      >
        {content}
      </MenuItem>
    );
  }

  return (
    <MenuItem component={Link} href={item.href ?? "#"} onClick={onClose} sx={ROW_SX}>
      {content}
    </MenuItem>
  );
}
