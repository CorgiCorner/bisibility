import { notificationCardGeometryClassNames } from "@/components/settings/notifications/notification-card-layout";
import {
  SettingsLoadingBar,
  SettingsRouteLoading,
} from "@/components/settings/shell/SettingsRouteLoading";
import {
  settingsCardFrameClassName,
  settingsCardNaturalFrameClassName,
} from "@/components/settings/shell/settings-layout";
import { cn } from "@/lib/ui/cn";

function ChannelsLoadingCard() {
  return (
    <section
      className={cn(settingsCardFrameClassName, notificationCardGeometryClassNames.channels)}
      data-notification-loading-frame="channels"
      data-settings-loading-frame="channels"
    >
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
    </section>
  );
}

function DeliveryAddressLoadingCard() {
  return (
    <section
      className={settingsCardNaturalFrameClassName}
      data-notification-loading-frame="delivery"
      data-settings-loading-frame="delivery"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 w-full space-y-2 sm:w-auto sm:flex-1">
            <SettingsLoadingBar className="h-4 w-32" />
            <SettingsLoadingBar className="h-3 w-60" />
          </div>
          <div className="ml-auto flex min-h-9 shrink-0 items-center">
            <SettingsLoadingBar className="h-8 w-28" />
          </div>
        </div>
        <div className="space-y-2">
          <SettingsLoadingBar className="h-3 w-72" />
        </div>
      </div>
    </section>
  );
}

export function NotificationsLoading() {
  return (
    <div aria-hidden className="space-y-5" data-notifications-loading="">
      <ChannelsLoadingCard />
      <DeliveryAddressLoadingCard />
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
