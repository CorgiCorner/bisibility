import { AdminAdministration } from "@/components/admin/AdminAdministration";
import { AdminAnnouncements } from "@/components/admin/AdminAnnouncements";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { isSelfHost } from "@/lib/deployment/deployment";
import { loadInstanceMailSettingsView } from "@/lib/email/instance-mail-store";
import { listInstanceAnnouncements } from "@/lib/instance-announcements/store";
import { getInstanceAdminAdministration } from "@/lib/queries/instance-admin-administration";

export default async function InstanceAdministrationPage() {
  await requireInstanceAdmin();
  const [data, mailSettings, announcements] = await Promise.all([
    getInstanceAdminAdministration(),
    isSelfHost ? loadInstanceMailSettingsView() : Promise.resolve(null),
    listInstanceAnnouncements(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <AdminAnnouncements initialAnnouncements={announcements} />
      <AdminAdministration
        data={data}
        mailSettings={mailSettings}
        showMailerWarning={isSelfHost && !data.mailerConfigured}
      />
    </div>
  );
}
