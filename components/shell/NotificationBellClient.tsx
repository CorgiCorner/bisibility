"use client";

import { Popup as Popover } from "@/components/ui/Popup";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/ToggleGroup";
import { useToast } from "@/components/ui/toast-context";
import {
  type NotificationTransport,
  useNotificationStream,
} from "@/lib/notifications/useNotificationStream";
import type { NotificationFeed, NotificationFeedItem } from "@/lib/queries/notifications";
import { useAppRealtime } from "@/lib/realtime/useAppRealtime";
import { UI_RADIUS_ROLES } from "@/lib/ui/design-role-tokens";
import { BellIcon as Bell } from "@phosphor-icons/react/dist/csr/Bell";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { NotificationRow } from "./NotificationRow";
import { OpenIncidentRows } from "./OpenIncidentRows";

export type NotificationBellClientProps = {
  defaultOpen?: boolean;
  feed: NotificationFeed;
  markAllNotificationsRead: () => Promise<{ updated: number }>;
  markNotificationRead: (input: { notificationId: string }) => Promise<{ updated: number }>;
  projectRef: string;
  refreshNotificationFeed: (openIncidents?: boolean) => Promise<NotificationFeed>;
  transport?: NotificationTransport;
  timeZone?: string;
};

const POPOVER_STYLE = {
  backgroundColor: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: UI_RADIUS_ROLES.card,
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
  if (item.withdrawnAt || item.readAt || readIds.has(item.id)) {
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

  const withdrawnCount = feed.items.filter((item) => item.withdrawnAt && !item.readAt).length;
  const localReadCount = feed.items.filter((item) => !item.readAt && readIds.has(item.id)).length;
  return Math.max(0, feed.unreadCount - localReadCount - withdrawnCount);
}

export function NotificationBellClient({
  transport = "stream",
  ...props
}: Readonly<NotificationBellClientProps>) {
  return transport === "polling" ? (
    <PollingNotificationBell {...props} />
  ) : (
    <RealtimeNotificationBell {...props} />
  );
}

function PollingNotificationBell(props: Readonly<NotificationBellClientProps>) {
  const { feed } = useNotificationStream(
    props.feed,
    props.projectRef,
    props.refreshNotificationFeed,
    "polling",
  );
  return <NotificationBellView {...props} feed={feed} />;
}

function RealtimeNotificationBell(props: Readonly<NotificationBellClientProps>) {
  const { notifications } = useAppRealtime();
  return <NotificationBellView {...props} feed={notifications ?? props.feed} />;
}

function NotificationBellView({
  defaultOpen = false,
  feed,
  markAllNotificationsRead,
  markNotificationRead,
  refreshNotificationFeed,
  timeZone,
}: Readonly<NotificationBellClientProps>) {
  const t = useTranslations("shell.notifications");
  const { showToast } = useToast();
  const [openIncidents, setOpenIncidents] = useState(false);
  const [incidentFeed, setIncidentFeed] = useState<NotificationFeed | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [allReadAt, setAllReadAt] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(defaultOpen);
  const [autoFocus, setAutoFocus] = useState(false);
  const unreadCount = unreadCountForFeed(feed, readIds, allReadAt);

  function close() {
    setOpen(false);
  }

  function markItemRead(item: NotificationFeedItem) {
    if (!isUnread(item, readIds, allReadAt)) {
      return;
    }

    setReadIds((current) => new Set(current).add(item.id));
    startTransition(async () => {
      try {
        await markNotificationRead({ notificationId: item.id });
      } catch {
        setReadIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        showToast(t("markReadError"), { severity: "error" });
      }
    });
  }

  function markAllRead() {
    const previousReadAt = allReadAt;
    setAllReadAt(new Date().toISOString());
    startTransition(async () => {
      try {
        await markAllNotificationsRead();
      } catch {
        setAllReadAt(previousReadAt);
        showToast(t("markReadError"), { severity: "error" });
      }
    });
  }

  return (
    <span className="relative flex-none">
      <button
        aria-controls={open ? "notification-bell-menu" : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t("title")}
        className={[
          "grid h-9 w-9 place-items-center rounded-control p-0 text-fg-muted transition-colors hover:bg-bg-sunken hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid",
          open ? "bg-bg-sunken" : "",
        ].join(" ")}
        ref={setAnchorEl}
        onClick={(event) => {
          setAutoFocus(event.detail === 0);
          setOpen(true);
        }}
        title={t("title")}
        type="button"
      >
        <Bell aria-hidden size={17} weight="regular" />
        {unreadCount > 0 ? (
          <span className="absolute right-1.5 top-[5px] grid h-[15px] min-w-[15px] place-items-center rounded-full border-[1.5px] border-bg bg-accent-solid px-[3px] font-sans tabular-nums text-[9px] font-semibold leading-none text-accent-on-solid">
            {unreadCount}
          </span>
        ) : null}
      </button>
      <Popover
        anchorEl={anchorEl}
        align="end"
        side="bottom"
        id="notification-bell-menu"
        onClose={close}
        open={open}
        autoFocus={autoFocus}
        contentProps={{ style: POPOVER_STYLE }}
      >
        <div className="flex items-center justify-between gap-2.5 border-b border-border px-4 py-[13px]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{t("title")}</span>
          </div>
          <button
            className="p-0 text-xs font-semibold text-accent-text disabled:text-fg-muted"
            disabled={unreadCount === 0 || isPending}
            onClick={markAllRead}
            type="button"
          >
            {t("markAllRead")}
          </button>
        </div>
        <div className="border-b border-border px-4 py-2">
          <ToggleGroup
            type="multiple"
            value={openIncidents ? ["incidents"] : []}
            disabled={isPending}
            onValueChange={() => {
              if (openIncidents) {
                setOpenIncidents(false);
                return;
              }
              startTransition(async () => {
                try {
                  setIncidentFeed(await refreshNotificationFeed(true));
                  setOpenIncidents(true);
                } catch {
                  showToast(t("filterError"), { severity: "error" });
                }
              });
            }}
          >
            <ToggleGroupItem value="incidents">{t("openIncidents")}</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {openIncidents && incidentFeed ? (
            <OpenIncidentRows
              initialFeed={incidentFeed}
              refreshFeed={refreshNotificationFeed}
              onNavigate={(item) => {
                markItemRead(item);
                close();
              }}
              isUnread={(item) => isUnread(item, readIds, allReadAt)}
            />
          ) : feed.items.some((item) => !item.withdrawnAt) ? (
            feed.items
              .filter((item) => !item.withdrawnAt)
              .map((item) => (
                <NotificationRow
                  item={item}
                  timeZone={timeZone}
                  key={item.id}
                  onNavigate={() => {
                    markItemRead(item);
                    close();
                  }}
                  unread={isUnread(item, readIds, allReadAt)}
                />
              ))
          ) : (
            <div className="px-4 py-8 text-center text-xs text-fg-muted">{t("empty")}</div>
          )}
        </div>
      </Popover>
    </span>
  );
}
