import { notificationCardGeometryClassNames } from "@/components/settings/notifications/notification-card-layout";
import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import { settingsCardFrameClassName } from "@/components/settings/shell/settings-layout";
import { cn } from "@/lib/ui/cn";

const frames = [
  { id: "channels", className: notificationCardGeometryClassNames.channels },
  { id: "email", className: notificationCardGeometryClassNames.email },
] as const;

function NotificationLoadingCard({ id }: Readonly<{ id: (typeof frames)[number]["id"] }>) {
  return (
    <section
      className={cn(settingsCardFrameClassName, frames.find((frame) => frame.id === id)?.className)}
      data-notification-loading-frame={id}
      data-settings-loading-frame={id}
    >
      {id === "channels" ? (
        <div className="space-y-5">
          <div className="space-y-2">
            <SettingsLoadingBar className="h-4 w-20" />
            <SettingsLoadingBar className="h-3 w-72 max-w-full" />
          </div>
          <div className="space-y-2">
            <SettingsLoadingBar className="h-3 w-32" />
            <SettingsLoadingBar className="h-[208px] w-full" />
            <SettingsLoadingBar className="h-3 w-5/6" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <SettingsLoadingBar className="h-4 w-32" />
              <SettingsLoadingBar className="h-3 w-60" />
            </div>
            <SettingsLoadingBar className="h-8 w-14" />
          </div>
          <div className="space-y-2">
            <SettingsLoadingBar className="h-3 w-32" />
            <SettingsLoadingBar className="h-10 w-full max-w-[400px]" />
            <SettingsLoadingBar className="h-3 w-4/5" />
          </div>
        </div>
      )}
    </section>
  );
}

export function NotificationsLoading() {
  return (
    <div aria-hidden className="space-y-5" data-notifications-loading="">
      {frames.map((frame) => (
        <NotificationLoadingCard id={frame.id} key={frame.id} />
      ))}
    </div>
  );
}

export function NotificationsRouteLoading() {
  return (
    <SettingsRouteLoading activeSection="notifications">
      <NotificationsLoading />
    </SettingsRouteLoading>
  );
}
