"use client";

import type { NotificationFeed, NotificationFeedItem } from "@/lib/queries/notifications";
import { appPath } from "@/lib/routing/app-path";
import Popover from "@mui/material/Popover";
import {
  ArrowRightIcon as ArrowRight,
  BellIcon as Bell,
  ChartLineUpIcon as ChartLineUp,
  FlagCheckeredIcon as FlagCheckered,
  UsersThreeIcon as UsersThree,
  WarningCircleIcon as WarningCircle,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react/lib";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  type NotificationStreamStatus,
  type NotificationTransport,
  useNotificationStream,
} from "./useNotificationStream";

type NotificationKind = "check" | "error" | "rank" | "system" | "team";

type NotificationBellClientProps = {
  defaultOpen?: boolean;
  feed: NotificationFeed;
  markAllNotificationsRead: () => Promise<{ updated: number }>;
  markNotificationRead: (input: { notificationId: string }) => Promise<{ updated: number }>;
  projectRef: string;
  refreshNotificationFeed: () => Promise<NotificationFeed>;
  transport?: NotificationTransport;
};

const tintForKind: Record<NotificationKind, { bg: string; fg: string }> = {
  check: {
    bg: "color-mix(in srgb, var(--green) 13%, transparent)",
    fg: "var(--green)",
  },
  error: {
    bg: "color-mix(in srgb, var(--red) 13%, transparent)",
    fg: "var(--red)",
  },
  rank: {
    bg: "color-mix(in srgb, var(--blue) 13%, transparent)",
    fg: "var(--blue)",
  },
  system: {
    bg: "color-mix(in srgb, var(--blue) 13%, transparent)",
    fg: "var(--blue)",
  },
  team: {
    bg: "color-mix(in srgb, var(--purple) 13%, transparent)",
    fg: "var(--purple)",
  },
};

const iconForType: Record<NotificationFeedItem["type"], Icon> = {
  alert_fired: WarningCircle,
  check_complete: FlagCheckered,
  check_failed: WarningCircle,
  import_done: FlagCheckered,
  import_failed: WarningCircle,
  invite: UsersThree,
  member_joined: UsersThree,
  system: Bell,
};

const kindForType: Record<NotificationFeedItem["type"], NotificationKind> = {
  alert_fired: "error",
  check_complete: "check",
  check_failed: "error",
  import_done: "check",
  import_failed: "error",
  invite: "team",
  member_joined: "team",
  system: "system",
};

const POPOVER_SX = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: "13px",
  boxShadow: "none",
  color: "var(--fg)",
  marginTop: "8px",
  maxWidth: "calc(100vw - 32px)",
  overflow: "hidden",
  width: 360,
} as const;

function isUnread(
  item: NotificationFeedItem,
  readIds: ReadonlySet<string>,
  allReadAt: string | null,
) {
  if (item.readAt || readIds.has(item.id)) {
    return false;
  }

  return !allReadAt || item.createdAt > allReadAt;
}

function unreadCountForFeed(
  feed: NotificationFeed,
  readIds: ReadonlySet<string>,
  allReadAt: string | null,
) {
  if (allReadAt) {
    return feed.items.filter((item) => isUnread(item, readIds, allReadAt)).length;
  }

  const localReadCount = feed.items.filter((item) => !item.readAt && readIds.has(item.id)).length;
  return Math.max(0, feed.unreadCount - localReadCount);
}

function statusLabel(status: NotificationStreamStatus) {
  if (status === "live") return "Live";
  if (status === "offline") return "Offline";
  return "Syncing";
}

export function NotificationBellClient({
  defaultOpen = false,
  feed,
  markAllNotificationsRead,
  markNotificationRead,
  projectRef,
  refreshNotificationFeed,
  transport = "stream",
}: Readonly<NotificationBellClientProps>) {
  const { feed: liveFeed, status } = useNotificationStream(
    feed,
    projectRef,
    refreshNotificationFeed,
    transport,
  );
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [allReadAt, setAllReadAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isLive = status === "live";
  const open = Boolean(anchorEl) || defaultOpen;
  const unreadCount = unreadCountForFeed(liveFeed, readIds, allReadAt);

  function close() {
    setAnchorEl(null);
  }

  function markItemRead(item: NotificationFeedItem) {
    if (!isUnread(item, readIds, allReadAt)) {
      return;
    }

    setReadIds((current) => new Set(current).add(item.id));
    startTransition(() => {
      void markNotificationRead({ notificationId: item.id });
    });
  }

  function markAllRead() {
    setAllReadAt(new Date().toISOString());
    startTransition(() => {
      void markAllNotificationsRead();
    });
  }

  return (
    <span className="relative flex-none">
      <button
        aria-controls={open ? "notification-bell-menu" : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Notifications"
        className={[
          "grid h-[38px] w-[38px] place-items-center rounded-[10px] border border-border-strong text-fg-muted outline-none transition-colors hover:border-accent focus-visible:border-accent",
          open ? "bg-bg-sunken" : "bg-bg-elev",
        ].join(" ")}
        onClick={(event) => setAnchorEl(event.currentTarget)}
        title="Notifications"
        type="button"
      >
        <Bell aria-hidden size={17} />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-[5px] grid h-[15px] min-w-[15px] place-items-center rounded-full border-[1.5px] border-bg bg-accent px-[3px] font-mono text-[9px] font-semibold leading-none text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>
      <Popover
        anchorEl={anchorEl}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        id="notification-bell-menu"
        onClose={close}
        open={open}
        slotProps={{ paper: { sx: POPOVER_SX } }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
      >
        <div className="flex items-center justify-between gap-2.5 border-b border-border px-4 py-[13px]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Notifications</span>
            <span
              className={[
                "inline-flex items-center gap-1.5 rounded-full bg-bg-sunken px-2 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.4px]",
                isLive ? "text-green" : "text-fg-faint",
              ].join(" ")}
            >
              <span className="relative grid h-[7px] w-[7px] place-items-center">
                <span
                  className={[
                    "absolute h-[7px] w-[7px] rounded-full",
                    isLive ? "bv-ping bg-green" : "bg-fg-faint",
                  ].join(" ")}
                />
                <span
                  className={[
                    "h-[5px] w-[5px] rounded-full",
                    isLive ? "bg-green" : "bg-fg-faint",
                  ].join(" ")}
                />
              </span>
              {statusLabel(status)}
            </span>
          </div>
          <button
            className="p-0 text-xs font-semibold text-accent disabled:text-fg-faint"
            disabled={unreadCount === 0 || isPending}
            onClick={markAllRead}
            type="button"
          >
            Mark all read
          </button>
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {liveFeed.items.length > 0 ? (
            liveFeed.items.map((item) => (
              <NotificationRow
                item={item}
                key={item.id}
                onNavigate={() => {
                  markItemRead(item);
                  close();
                }}
                unread={isUnread(item, readIds, allReadAt)}
              />
            ))
          ) : (
            <div className="px-4 py-8 text-center text-xs text-fg-faint">No notifications</div>
          )}
        </div>
        <Link
          className="flex w-full items-center justify-center gap-1.5 border-t border-border-soft bg-transparent px-3 py-2.5 text-xs font-medium text-fg-muted transition-colors hover:text-accent"
          href={appPath(projectRef, "settings", "audit")}
          onClick={close}
        >
          View audit log
          <ArrowRight aria-hidden size={12} />
        </Link>
      </Popover>
    </span>
  );
}

type NotificationRowProps = {
  item: NotificationFeedItem;
  onNavigate: () => void;
  unread: boolean;
};

function NotificationRow({ item, onNavigate, unread }: Readonly<NotificationRowProps>) {
  const Icon = iconForType[item.type] ?? ChartLineUp;
  const tint = tintForKind[kindForType[item.type] ?? "rank"];

  return (
    <Link
      className="flex w-full items-start gap-[11px] border-b border-border-soft px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-bg-sunken"
      href={item.href}
      onClick={onNavigate}
    >
      <span
        className="grid h-8 w-8 flex-none place-items-center rounded-[9px]"
        style={{ background: tint.bg, color: tint.fg }}
      >
        <Icon aria-hidden size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-[1.35] text-fg">{item.title}</span>
        <span className="mt-0.5 block font-mono text-[11px] text-fg-faint">{item.meta}</span>
      </span>
      <span className="flex flex-none flex-col items-end gap-[5px]">
        <span className="font-mono text-[10.5px] text-fg-faint">{item.time}</span>
        <span
          className="h-[7px] w-[7px] rounded-full bg-accent"
          style={{ visibility: unread ? "visible" : "hidden" }}
        />
      </span>
    </Link>
  );
}
