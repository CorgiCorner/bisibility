"use client";

// The delivery copy is serialized only into the notifications page's FeatureMessagesProvider,
// so this card has to resolve it on the client side of that boundary: a Server Component reads
// the `shared`-only request config and paints `projectSettingsNotifications.delivery` keys raw.

import { NotificationChannelsCard } from "@/components/settings/notifications/NotificationChannelsCard";
import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { Button } from "@/components/ui/Button";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";
import { appRootPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";

export type NotificationPreferencesProps = {
  canEdit: boolean;
  preferences: NotificationPreferencesView;
};

export function NotificationPreferences({
  canEdit,
  preferences,
}: Readonly<NotificationPreferencesProps>) {
  const t = useTranslations("projectSettingsNotifications.delivery");
  return (
    <div className="space-y-5" data-notifications-section="">
      <NotificationChannelsCard canEdit={canEdit} preferences={preferences} />
      <SettingsCard
        action={
          <Button href={appRootPath("account")} size="sm" variant="secondary">
            {t("manageEmail")}
          </Button>
        }
        className="min-h-auto"
        description={t("description")}
        showSave={false}
        title={t("title")}
      >
        <p className="m-0 text-[13px] leading-5 text-fg">
          {t.rich("deliveredTo", {
            address: (value) => <span className="font-sans tabular-nums font-medium">{value}</span>,
            email: preferences.email,
          })}
        </p>
      </SettingsCard>
    </div>
  );
}
