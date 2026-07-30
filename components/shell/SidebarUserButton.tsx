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
          "flex w-full items-center rounded-[10px] text-left text-fg transition-colors hover:bg-bg-sunken",
          // Expanded reads as a card; collapsed drops to a bare icon (parity with the switcher).
          collapsed
            ? "justify-center gap-0 border-0 bg-transparent p-2"
            : "gap-2.5 border border-border bg-bg-elev p-2",
          open ? "bg-bg-sunken" : "",
        ].join(" ")}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        type="button"
      >
        <span className="grid h-8 w-8 flex-none place-items-center rounded-[9px] bg-accent font-mono text-xs font-semibold text-white">
          {initials}
        </span>
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold leading-tight">
                {name}
              </span>
              {showEmail ? (
                <span className="block truncate text-[11px] text-fg-faint">{email}</span>
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
