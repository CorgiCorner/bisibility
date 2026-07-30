import "@/lib/deployment/runtime-env.generated";

import {
  markAllNotificationsRead,
  markNotificationRead,
  refreshNotificationFeed,
} from "@/lib/actions/notifications";
import { NotificationBellClient } from "@/lib/notifications/NotificationBellClient";
import { getNotificationBellData, type NotificationFeed } from "@/lib/queries/notifications";

export type NotificationBellProps = {
  defaultOpen?: boolean;
  feed?: NotificationFeed;
  projectId: string;
  projectRef: string;
};

export async function NotificationBell({
  defaultOpen = false,
  feed,
  projectId,
  projectRef,
}: Readonly<NotificationBellProps>) {
  const data = feed ?? (await getNotificationBellData(projectId));

  return (
    <NotificationBellClient
      defaultOpen={defaultOpen}
      feed={data}
      markAllNotificationsRead={markAllNotificationsRead.bind(null, projectId)}
      markNotificationRead={markNotificationRead}
      projectRef={projectRef}
      refreshNotificationFeed={refreshNotificationFeed.bind(null, projectId)}
      transport={process.env.NOTIFICATION_TRANSPORT === "polling" ? "polling" : "stream"}
    />
  );
}
