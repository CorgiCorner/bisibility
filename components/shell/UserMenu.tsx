"use client";

import { useCommandPalette } from "@/components/shell/CommandPalette";
import type { ThemeMode } from "@/components/shell/set-theme";
import { ThemeSegments } from "@/components/shell/ThemeSegments";
import { UserMenuRow } from "@/components/shell/UserMenuRow";
import {
  accountLinks,
  communityLinks,
  resourceLinksForDeployment,
  signOutLink,
} from "@/components/shell/user-menu-items";
import { authClient } from "@/lib/auth/client";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import { useState } from "react";

const PAPER_SX = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: "13px",
  boxShadow: "none",
  color: "var(--fg)",
  marginTop: "-6px",
  minWidth: 248,
  padding: "6px",
  width: 248,
} as const;

const DIVIDER_SX = { borderColor: "var(--border)", marginX: "4px", marginY: "6px" } as const;

export type UserMenuProps = {
  anchorEl: HTMLElement | null;
  defaultTheme?: ThemeMode;
  email: string;
  initials: string;
  name: string;
  onClose: () => void;
  /** Fired alongside onClose when a row navigates (closes the mobile drawer). */
  onNavigate?: () => void;
  roleLine: string;
  showHostedLinks?: boolean;
};

export function UserMenu({
  anchorEl,
  defaultTheme = "light",
  email,
  initials,
  name,
  onClose,
  onNavigate,
  roleLine,
  showHostedLinks = false,
}: Readonly<UserMenuProps>) {
  const [pending, setPending] = useState(false);
  const { openPalette } = useCommandPalette();

  function closeAfterNavigate() {
    onClose();
    onNavigate?.();
  }

  function openPaletteFromMenu() {
    closeAfterNavigate();
    openPalette();
  }

  async function handleSignOut() {
    setPending(true);
    closeAfterNavigate();
    await authClient.signOut();
    window.location.href = "/login";
  }

  return (
    <Menu
      anchorEl={anchorEl}
      anchorOrigin={{ horizontal: "left", vertical: "top" }}
      id="sidebar-user-menu"
      onClose={onClose}
      open={Boolean(anchorEl)}
      slotProps={{
        list: { "aria-label": "Account menu", dense: true, sx: { padding: 0 } },
        paper: { sx: PAPER_SX },
      }}
      transformOrigin={{ horizontal: "left", vertical: "bottom" }}
    >
      <div className="flex items-center gap-2.5 px-[9px] pb-[11px] pt-[9px]">
        <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-accent font-mono text-xs font-semibold text-white">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight">{name}</span>
          <span className="block truncate font-mono text-[10.5px] text-fg-faint">{email}</span>
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.4px] text-accent">
            {roleLine}
          </span>
        </span>
      </div>
      <Divider sx={{ ...DIVIDER_SX, marginTop: "2px" }} />
      <ThemeSegments defaultTheme={defaultTheme} />
      <Divider sx={DIVIDER_SX} />
      {accountLinks.map((item) => (
        <UserMenuRow
          item={item}
          key={item.label}
          onClose={closeAfterNavigate}
          onSelect={item.action === "command-palette" ? openPaletteFromMenu : undefined}
        />
      ))}
      <Divider sx={DIVIDER_SX} />
      {resourceLinksForDeployment(showHostedLinks).map((item) => (
        <UserMenuRow item={item} key={item.label} onClose={closeAfterNavigate} />
      ))}
      <Divider sx={DIVIDER_SX} />
      {communityLinks.map((item) => (
        <UserMenuRow item={item} key={item.label} onClose={closeAfterNavigate} />
      ))}
      <Divider sx={DIVIDER_SX} />
      <UserMenuRow disabled={pending} item={signOutLink} onSelect={() => void handleSignOut()} />
    </Menu>
  );
}
