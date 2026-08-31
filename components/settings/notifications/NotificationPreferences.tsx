import { NotificationChannelsCard } from "@/components/settings/notifications/NotificationChannelsCard";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { Button } from "@/components/ui";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import { appRootPath } from "@/lib/routing/app-path";

export type NotificationPreferencesProps = {
  canEdit: boolean;
  preferences: NotificationPreferencesView;
};

export function NotificationPreferences({
  canEdit,
  preferences,
}: Readonly<NotificationPreferencesProps>) {
  return (
    <div className="space-y-5" data-notifications-section="">
      <NotificationChannelsCard canEdit={canEdit} preferences={preferences} />
      <SettingsCard
        action={
          <Button href={appRootPath("account")} size="sm" variant="secondary">
            Manage email
          </Button>
        }
        className="min-h-auto"
        description="The address that receives notification emails."
        showSave={false}
        title="Delivery address"
      >
        <p className="m-0 text-[13px] leading-5 text-fg">
          Notifications are delivered to{" "}
          <span className="font-mono font-medium">{preferences.email}</span>.
        </p>
      </SettingsCard>
    </div>
  );
}
