import { NotificationChannelsCard } from "@/components/settings/notifications/NotificationChannelsCard";
import {
  type ConfirmAccountEmailChange,
  type ConfirmCurrentAccountEmailVerification,
  NotificationEmailCard,
  type RequestAccountEmailChange,
  type RequestCurrentAccountEmailVerification,
} from "@/components/settings/notifications/NotificationEmailCard";
import type { NotificationPreferencesView } from "@/lib/queries/notification-prefs";

export type NotificationPreferencesProps = {
  canEdit: boolean;
  confirmAccountEmailChange?: ConfirmAccountEmailChange;
  confirmCurrentAccountEmailVerification?: ConfirmCurrentAccountEmailVerification;
  preferences: NotificationPreferencesView;
  requestAccountEmailChange?: RequestAccountEmailChange;
  requestCurrentAccountEmailVerification?: RequestCurrentAccountEmailVerification;
};

export function NotificationPreferences({
  canEdit,
  confirmAccountEmailChange,
  confirmCurrentAccountEmailVerification,
  preferences,
  requestAccountEmailChange,
  requestCurrentAccountEmailVerification,
}: Readonly<NotificationPreferencesProps>) {
  return (
    <div className="space-y-5" data-notifications-section="">
      <NotificationChannelsCard canEdit={canEdit} preferences={preferences} />
      <NotificationEmailCard
        key={`${preferences.email}:${preferences.emailVerification}`}
        confirmAccountEmailChange={confirmAccountEmailChange}
        confirmCurrentAccountEmailVerification={confirmCurrentAccountEmailVerification}
        preferences={preferences}
        requestAccountEmailChange={requestAccountEmailChange}
        requestCurrentAccountEmailVerification={requestCurrentAccountEmailVerification}
      />
    </div>
  );
}
