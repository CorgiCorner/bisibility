"use client";

import { useCommandPalette } from "@/components/shell/CommandPalette";
import { UserMenuRow } from "@/components/shell/UserMenuRow";
import {
  accountLinks,
  communityLinks,
  resourceLinksForDeployment,
  signOutLink,
} from "@/components/shell/user-menu-items";
import { useToast } from "@/components/ui";
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
  marginTop: "6px",
  minWidth: 248,
  padding: "6px",
  width: 248,
} as const;

const DIVIDER_SX = { borderColor: "var(--border)", marginX: "4px", marginY: "6px" } as const;

export type UserMenuProps = {
  anchorEl: HTMLElement | null;
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
  const { showToast } = useToast();

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
    try {
      await authClient.signOut();
    } catch {
      // The session is still live, and /login would redirect straight back into the app,
      // so surface the failure here instead of navigating into a no-op.
      setPending(false);
      showToast("Could not sign out. Please try again.", { tint: "red" });
      return;
    }
    closeAfterNavigate();
    window.location.href = "/login";
  }

  return (
    <Menu
      anchorEl={anchorEl}
      anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      id="sidebar-user-menu"
      onClose={onClose}
      open={Boolean(anchorEl)}
      slotProps={{
        list: { "aria-label": "Account menu", dense: true, sx: { padding: 0 } },
        paper: { sx: PAPER_SX },
      }}
      transformOrigin={{ horizontal: "right", vertical: "top" }}
    >
      <div className="flex items-center gap-2.5 px-[9px] pb-[11px] pt-[9px]">
        <span className="grid h-[34px] w-[34px] flex-none place-items-center rounded-[9px] bg-accent-solid font-mono text-xs font-semibold text-primary-contrast">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight">{name}</span>
          <span className="block truncate font-mono text-[10.5px] text-fg-muted">{email}</span>
          <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.4px] text-accent-text">
            {roleLine}
          </span>
        </span>
      </div>
      <Divider sx={{ ...DIVIDER_SX, marginTop: "2px" }} />
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
