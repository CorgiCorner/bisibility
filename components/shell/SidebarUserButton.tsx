"use client";

import {
  type ShellUser,
  shellUserEmail,
  shellUserName,
  shellUserRoleLine,
} from "@/components/shell/types";
import { UserMenu } from "@/components/shell/UserMenu";
import { Avatar } from "@/components/ui/Avatar";
import { headerUtilityControlClassName } from "@/components/ui/header-icon-button-styles";
import { initials as avatarInitials } from "@/lib/avatar/initials";
import { cn } from "@/lib/ui/cn";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/dist/csr/DotsThreeVertical";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("shell.userMenu");
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const name = shellUserName(user, t("fallbackName"));
  const email = shellUserEmail(user);
  const initials = avatarInitials(name, email);
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
        aria-label={t("accountMenu")}
        className={[
          "group flex items-center rounded-control text-left text-fg transition-colors",
          collapsed ? headerUtilityControlClassName : "hover:bg-bg-sunken",
          // Expanded reads as a card; collapsed is a 32px icon button matching the search and
          // bell beside it, so its hover box is not the largest thing in the cluster.
          collapsed
            ? "h-8 w-8 flex-none justify-center gap-0 p-0"
            : "w-full gap-2.5 border border-border bg-bg-elev p-2",
          !collapsed && open ? "bg-bg-sunken" : "",
        ].join(" ")}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        type="button"
      >
        {/* The header button owns the quiet border and interaction fill. Images and initials
            share its dimensions without introducing a second tile or a primary-action fill. */}
        <Avatar
          alt=""
          className={cn(
            "grid flex-none place-items-center rounded-control font-semibold text-fg",
            collapsed
              ? "h-full w-full text-[10.5px]"
              : "h-8 w-8 border border-border-control bg-bg-elev text-xs",
          )}
          initials={initials}
          src={user?.avatarUrl}
        />
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
            <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-control text-fg-muted">
              <DotsThreeVertical aria-hidden size={19} weight="regular" />
            </span>
          </>
        )}
      </button>
      <UserMenu
        anchorEl={anchorEl}
        avatarUrl={user?.avatarUrl}
        email={email}
        name={name}
        onClose={close}
        onNavigate={onNavigate}
        roleLine={shellUserRoleLine(user)}
        showHostedLinks={showHostedLinks}
      />
    </>
  );
}
