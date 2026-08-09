"use client";

import {
  type ShellUser,
  shellUserEmail,
  shellUserInitials,
  shellUserName,
  shellUserRoleLine,
} from "@/components/shell/types";
import { UserMenu } from "@/components/shell/UserMenu";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react";
import { useState } from "react";

export type SidebarUserButtonProps = {
  collapsed?: boolean;
  onNavigate?: () => void;
  showHostedLinks?: boolean;
  user?: ShellUser;
};

export function SidebarUserButton({
  collapsed = false,
  onNavigate,
  showHostedLinks = false,
  user,
}: Readonly<SidebarUserButtonProps>) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const name = shellUserName(user);
  const email = shellUserEmail(user);
  const initials = shellUserInitials(user);
  // With no name set, `name` falls back to the email; don't print the email twice.
  const showEmail = Boolean(email) && email !== name;
  const open = Boolean(anchorEl);

  function close() {
    setAnchorEl(null);
  }

  return (
    <>
      <button
        aria-controls={open ? "sidebar-user-menu" : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className={[
          "group flex items-center rounded-[9px] text-left text-fg transition-colors",
          collapsed ? "" : "hover:bg-bg-sunken",
          // Expanded reads as a card; collapsed is a 32px icon button matching the search and
          // bell beside it, so its hover box is not the largest thing in the cluster.
          collapsed
            ? "h-8 w-8 flex-none justify-center gap-0 border-0 bg-transparent p-0"
            : "w-full gap-2.5 border border-border bg-bg-elev p-2",
          open ? "bg-bg-sunken" : "",
        ].join(" ")}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        type="button"
      >
        {/* Same tile spec as the search and bell buttons beside it (bg-bg-elev on
            border-border-strong, hover to bg-bg-sunken); the accent initials alone carry
            the identity signal, so the cluster reads as one family of controls. */}
        <span
          className={[
            "grid flex-none place-items-center rounded-[9px] border border-border-strong bg-bg-elev font-mono font-semibold text-accent-text transition-colors",
            collapsed ? "h-8 w-8 text-[10.5px] group-hover:bg-bg-sunken" : "h-8 w-8 text-xs",
            collapsed && open ? "bg-bg-sunken" : "",
          ].join(" ")}
        >
          {initials}
        </span>
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold leading-tight">
                {name}
              </span>
              {showEmail ? (
                <span className="block truncate text-[11px] text-fg-muted">{email}</span>
              ) : null}
            </span>
            <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-lg text-fg-muted">
              <DotsThreeVertical aria-hidden size={19} weight="bold" />
            </span>
          </>
        )}
      </button>
      <UserMenu
        anchorEl={anchorEl}
        defaultTheme={user?.theme}
        email={email}
        initials={initials}
        name={name}
        onClose={close}
        onNavigate={onNavigate}
        roleLine={shellUserRoleLine(user)}
        showHostedLinks={showHostedLinks}
      />
    </>
  );
}
