import { AdminAdministration } from "@/components/admin/AdminAdministration";
import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { getInstanceAdminAdministration } from "@/lib/queries/instance-admin-administration";

export default async function InstanceAdministrationPage() {
  await requireInstanceAdmin();
  const data = await getInstanceAdminAdministration();

  return <AdminAdministration data={data} />;
}
