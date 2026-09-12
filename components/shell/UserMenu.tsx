"use client";

import { UserMenuRow } from "@/components/shell/UserMenuRow";
import {
  accountLinks,
  communityLinks,
  resourceLinksForDeployment,
  signOutLink,
} from "@/components/shell/user-menu-items";
import { Avatar } from "@/components/ui/Avatar";
import { Divider } from "@/components/ui/Divider";
import { Menu } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/toast-context";
import { authClient } from "@/lib/auth/client";
import { notifyAuthenticatedSessionEnd } from "@/lib/auth/session-end";
import { initials as avatarInitials } from "@/lib/avatar/initials";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { useState } from "react";

const PAPER_STYLE = {
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

const DIVIDER_STYLE = {
  borderColor: "var(--border)",
  marginLeft: "-6px",
  marginRight: "-6px",
  marginTop: "6px",
  marginBottom: "6px",
} as const;

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
      notifyAuthenticatedSessionEnd();
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
      align="end"
      side="bottom"
      id="sidebar-user-menu"
      onClose={onClose}
      open={Boolean(anchorEl)}
      listProps={{ "aria-label": "Account menu", style: { padding: 0 } }}
      contentProps={{ style: PAPER_STYLE }}
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
      <Divider style={{ ...DIVIDER_STYLE, marginTop: "2px" }} />
      {accountLinks.map((item) => (
        <UserMenuRow item={item} key={item.label} onClose={closeAfterNavigate} />
      ))}
      <Divider style={DIVIDER_STYLE} />
      {resourceLinksForDeployment(showHostedLinks).map((item) => (
        <UserMenuRow item={item} key={item.label} onClose={closeAfterNavigate} />
      ))}
      <Divider style={DIVIDER_STYLE} />
      {communityLinks.map((item) => (
        <UserMenuRow item={item} key={item.label} onClose={closeAfterNavigate} />
      ))}
      <Divider style={DIVIDER_STYLE} />
      <UserMenuRow disabled={pending} item={signOutLink} onSelect={() => void handleSignOut()} />
    </Menu>
  );
}
