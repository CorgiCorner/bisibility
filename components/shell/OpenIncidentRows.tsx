"use client";
import { useNotificationStream } from "@/lib/notifications/useNotificationStream";
import type { NotificationFeed, NotificationFeedItem } from "@/lib/queries/notifications";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { NotificationRow } from "./NotificationRow";

export function OpenIncidentRows({
  initialFeed,
  refreshFeed,
  onNavigate,
  isUnread,
}: {
  initialFeed: NotificationFeed;
  refreshFeed: (openIncidents?: boolean) => Promise<NotificationFeed>;
  onNavigate: (item: NotificationFeedItem) => void;
  isUnread: (item: NotificationFeedItem) => boolean;
}) {
  const refresh = useCallback(() => refreshFeed(true), [refreshFeed]);
  const { feed } = useNotificationStream(initialFeed, "open-incidents", refresh, "polling");
  const t = useTranslations("shell.notifications");
  const items = feed.items.filter((item) => !item.withdrawnAt);
  return items.length ? (
    items.map((item) => (
      <NotificationRow
        key={item.id}
        item={item}
        unread={isUnread(item)}
        onNavigate={() => onNavigate(item)}
      />
    ))
  ) : (
    <div className="px-4 py-8 text-center text-xs text-fg-muted">{t("empty")}</div>
  );
}
