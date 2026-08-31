import { AdminAdministration } from "@/components/admin/AdminAdministration";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { isSelfHost } from "@/lib/deployment/deployment";
import { getInstanceAdminAdministration } from "@/lib/queries/instance-admin-administration";

export default async function InstanceAdministrationPage() {
  await requireInstanceAdmin();
  const data = await getInstanceAdminAdministration();

  return (
    <AdminAdministration data={data} showMailerWarning={isSelfHost && !data.mailerConfigured} />
  );
}
