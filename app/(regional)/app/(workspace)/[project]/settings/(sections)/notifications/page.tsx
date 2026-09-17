import { NotificationPreferences } from "@/components/settings/notifications/NotificationPreferences";
import { SettingsShell } from "@/components/settings/shell/SettingsShell";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getNotificationPreferences } from "@/lib/queries/notification-prefs";
import { asProjectRef } from "@/lib/routing/app-path";

type NotificationsSettingsPageProps = { params: Promise<{ project: string }> };

export default async function NotificationsSettingsPage({
  params,
}: Readonly<NotificationsSettingsPageProps>) {
  const { project: projectRef } = await params;
  const [{ actor, project }, preferences, runtime] = await Promise.all([
    requireReadableProject(projectRef),
    getNotificationPreferences(projectRef),
    resolveRegionalDocumentLocale(),
  ]);
  const messages = await loadCoreMessages(runtime.locale, [
    "shared",
    "projectSettingsShell",
    "projectSettingsNotifications",
  ]);
  const role = getProjectRole(actor, project.id);
  const canEdit =
    project.writeMode === "active" && canProjectAction(role, "update", "notification_preference");

  return (
    <SettingsShell activeSection="notifications" projectRef={asProjectRef(project.publicId)}>
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <div data-settings-section-slot="notifications">
          <NotificationPreferences canEdit={canEdit} preferences={preferences} />
        </div>
      </FeatureMessagesProvider>
    </SettingsShell>
  );
}

import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
