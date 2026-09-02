"use client";

import { UserMenuRow } from "@/components/shell/UserMenuRow";
import {
  accountLinks,
  communityLinks,
  resourceLinksForDeployment,
  signOutLink,
} from "@/components/shell/user-menu-items";
import { Avatar, useToast } from "@/components/ui";
import { authClient } from "@/lib/auth/client";
import { initials as avatarInitials } from "@/lib/avatar/initials";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import Divider from "@mui/material/Divider";
import Menu from "@mui/material/Menu";
import { useState } from "react";

const PAPER_SX = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: UI_RADIUS_ROLES.card,
  boxShadow: "none",
  color: "var(--fg)",
  marginTop: "6px",
  minWidth: 248,
  padding: "6px",
  width: 248,
} as const;

const DIVIDER_SX = { borderColor: "var(--border)", marginX: "-6px", marginY: "6px" } as const;

export type UserMenuProps = {
  anchorEl: HTMLElement | null;
  avatarUrl?: string | null;
  email: string;
  name: string;
  onClose: () => void;
  /** Fired alongside onClose when a row navigates (closes the mobile drawer). */
  onNavigate?: () => void;
  roleLine: string;
  showHostedLinks?: boolean;
};

export function UserMenu({
  anchorEl,
  avatarUrl,
  email,
  name,
  onClose,
  onNavigate,
  roleLine,
  showHostedLinks = false,
}: Readonly<UserMenuProps>) {
  const [pending, setPending] = useState(false);
  const { showToast } = useToast();
  const initials = avatarInitials(name, email);

  function closeAfterNavigate() {
    onClose();
    onNavigate?.();
  }

  async function handleSignOut() {
    setPending(true);
    try {
      await authClient.signOut();
    } catch {
      // The session is still live, and /login would redirect straight back into the app,
      // so surface the failure here instead of navigating into a no-op.
      setPending(false);
      showToast("Could not sign out. Please try again.", { severity: "error" });
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
        <Avatar
          alt=""
          className="grid h-8.5 w-[34px] flex-none place-items-center rounded-control bg-accent-solid text-xs font-semibold text-accent-on-solid"
          initials={initials}
          src={avatarUrl}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight">{name}</span>
          <span className="block truncate text-[10.5px] text-fg-muted">{email}</span>
          <span className="mt-1 block text-[9px] uppercase tracking-[0.4px] text-fg-muted">
            {roleLine}
          </span>
        </span>
      </div>
      <Divider sx={{ ...DIVIDER_SX, marginTop: "2px" }} />
      {accountLinks.map((item) => (
        <UserMenuRow item={item} key={item.label} onClose={closeAfterNavigate} />
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
