import { AdminAdministration } from "@/components/admin/AdminAdministration";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { isSelfHost } from "@/lib/deployment/deployment";
import { loadInstanceMailSettingsView } from "@/lib/email/instance-mail-store";
import { getInstanceAdminAdministration } from "@/lib/queries/instance-admin-administration";

export default async function InstanceAdministrationPage() {
  await requireInstanceAdmin();
  const data = await getInstanceAdminAdministration();
  const mailSettings = isSelfHost ? await loadInstanceMailSettingsView() : null;

  return (
    <AdminAdministration
      data={data}
      mailSettings={mailSettings}
      showMailerWarning={isSelfHost && !data.mailerConfigured}
    />
  );
}
