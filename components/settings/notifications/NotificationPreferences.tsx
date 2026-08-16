import { NotificationChannelsCard } from "@/components/settings/notifications/NotificationChannelsCard";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import { appRootPath } from "@/lib/routing/app-path";
import Link from "next/link";

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
        description="The address that receives notification emails."
        showSave={false}
        title="Delivery address"
      >
        <p className="m-0 text-[13px] leading-5 text-fg">
          Notifications are delivered to{" "}
          <span className="font-mono font-medium">{preferences.email}</span>.{" "}
          <Link className="text-accent-text underline" href={appRootPath("account")}>
            Manage your account email
          </Link>
          .
        </p>
      </SettingsCard>
    </div>
  );
}
